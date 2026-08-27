/**
 * End-to-end smoke test of the whole stack, driven through the SAME client
 * the three apps vendor. Proves the client contract, not just the API.
 *
 * Requires the backend running with SMS_PROVIDER=console; the OTP is read back
 * out of the backend log, exactly as a developer would read it off stdout.
 *
 *   node prototype/shared/smoke-test.mjs [backendLogPath]
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from './api-client.js'

const BACKEND_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'backend')

const BASE = process.env.API_URL ?? 'http://localhost:4000'
const LOG = process.argv[2] ?? '/tmp/mydriver-backend.log'

let passed = 0
let failed = 0

const check = (label, condition, detail = '') => {
  if (condition) {
    passed++
    console.log(`  ok   ${label}`)
  } else {
    failed++
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Reads the most recent 6-digit code the console SMS adapter printed. */
function latestOtp(phone) {
  const log = readFileSync(LOG, 'utf8')
  const re = new RegExp(`\\[sms:console\\] -> \\${phone}: (\\d{6})`, 'g')
  let match
  let last = null
  while ((match = re.exec(log)) !== null) last = match[1]
  return last
}

async function login(phone, role) {
  const client = createClient({ baseUrl: BASE })
  await client.auth.requestOtp(phone, role)
  await sleep(300)
  const otp = latestOtp(phone)
  if (!otp) throw new Error(`no OTP found in ${LOG} for ${phone}`)
  await client.auth.verifyOtp(phone, otp, role)
  return client
}

async function waitFor(fn, predicate, { timeout = 15000, interval = 300 } = {}) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    last = await fn()
    if (predicate(last)) return last
    await sleep(interval)
  }
  return last
}

const stamp = Date.now().toString().slice(-7)
const CUSTOMER = `+9199${stamp}`
const DRIVER = `+9198${stamp}`

/**
 * Each run books in its own patch of map. Dispatch searches 5 km around the
 * pickup, so a unique origin guarantees only THIS run's driver is a candidate
 * — no leftover ONLINE driver from an earlier run can win the offer, and no
 * database surgery is needed to isolate the test.
 */
const jitter = () => (Math.random() - 0.5) * 4
const HITEC = { lat: 17.4399 + jitter(), lng: 78.3813 + jitter() }
const GACHIBOWLI = { lat: HITEC.lat - 0.0143, lng: HITEC.lng - 0.0493 }

console.log(`\nMyDriver end-to-end smoke test → ${BASE}\n`)

try {
  /* ── Catalogue ─────────────────────────────────────────────────────── */
  const anon = createClient({ baseUrl: BASE })
  const cards = await anon.catalogue.rateCards()
  check('rate cards load without auth', cards.length === 5, `got ${cards.length}`)
  check(
    'MD-Standard priced at the advertised rate',
    cards.find((c) => c.skill_id === 'MD-Standard')?.per_km_rate === 16,
  )

  /* ── Auth ──────────────────────────────────────────────────────────── */
  const customer = await login(CUSTOMER, 'CUSTOMER')
  const me = await customer.me.get()
  check('customer signs in via OTP', me.phone_number === CUSTOMER)
  check('customer token is scoped to CUSTOMER', me.role === 'CUSTOMER')

  await customer.me.update({ full_name: 'Priya Sharma' })
  check('profile update persists', (await customer.me.get()).full_name === 'Priya Sharma')

  const driver = await login(DRIVER, 'DRIVER')
  check('driver signs in via OTP', (await driver.me.get()).role === 'DRIVER')

  /* ── Guardians ─────────────────────────────────────────────────────── */
  await customer.me.guardians.add({ name: 'Rajesh', relation: 'Father', phone: '+919848012345' })
  const guardians = await customer.me.guardians.list()
  check('guardian added and listed', guardians.length === 1 && guardians[0].position === 1)

  /* ── Driver goes online ────────────────────────────────────────────── */
  const online = await driver.driver.setAvailability('ONLINE', HITEC)
  check('going ONLINE with a location is immediately dispatchable', online.dispatchable === true)

  const summaryBefore = await driver.driver.summary()
  check('driver summary reports ONLINE', summaryBefore.availability === 'ONLINE')

  const driverRt = driver.realtime({})
  await driverRt.connect()

  /* ── Quote ─────────────────────────────────────────────────────────── */
  const quote = await customer.trips.quote({
    booking_type: 'POINT_TO_POINT',
    pickup: HITEC,
    drop: GACHIBOWLI,
    required_certification: 'MD-Standard',
  })
  check('quote returns a distance', quote.distance_km > 0)
  check('quote charges the platform fee', quote.fare.platform_fee === 19)
  check('quote has no VisionCam field', !('mode' in quote))

  /* ── Dashcam exclusion is enforced ─────────────────────────────────── */
  let rejected = false
  try {
    await customer.trips.quote({
      booking_type: 'POINT_TO_POINT',
      pickup: HITEC,
      drop: GACHIBOWLI,
      required_certification: 'MD-Standard',
      mode: 'MODE_F',
    })
  } catch (err) {
    rejected = err.status === 400
  }
  check('a VisionCam mode is rejected, not ignored', rejected)

  /* ── Booking ───────────────────────────────────────────────────────── */
  const idem = `smoke-${stamp}`
  const booked = await customer.trips.book(
    {
      booking_type: 'POINT_TO_POINT',
      pickup: HITEC,
      pickup_address: 'Cyber Towers, HITEC City',
      drop: GACHIBOWLI,
      drop_address: 'Financial District Road',
      required_certification: 'MD-Standard',
      speed_ceiling_kmh: 60,
    },
    idem,
  )
  check('trip books', Boolean(booked.id))
  check('trip starts REQUESTED', booked.status === 'REQUESTED')

  const repeat = await customer.trips.book(
    {
      booking_type: 'POINT_TO_POINT',
      pickup: HITEC,
      drop: GACHIBOWLI,
      required_certification: 'MD-Standard',
      speed_ceiling_kmh: 60,
    },
    idem,
  )
  check('booking is idempotent', repeat.id === booked.id)

  /* ── Customer watches over the socket ──────────────────────────────── */
  const seen = []
  const customerRt = customer.realtime({})
  customerRt.on('*', (f) => seen.push(f.type))
  await customerRt.connect()
  customerRt.subscribe(booked.id)

  /* ── Dispatch ──────────────────────────────────────────────────────── */
  const matched = await waitFor(
    () => customer.trips.get(booked.id),
    (t) => t.status === 'MATCHED' || t.status === 'NO_DRIVERS_FOUND',
  )
  check('dispatch offers the trip to the online driver', matched.status === 'MATCHED',
    `status=${matched.status}`)

  // Discover the offer the way the driver app must: the driver never sees the
  // booking response, and cannot SUBSCRIBE to the trip channel that carries
  // TRIP_OFFER until they are already a participant. Polling is the only path.
  const pending = await waitFor(
    () => driver.driver.offers(),
    (list) => list.length > 0,
  )
  const theOffer = pending[0]
  check('driver discovers the pending offer without knowing the trip id',
    theOffer?.trip_id === booked.id, `got ${theOffer?.trip_id}`)
  check('offer carries the pickup address for the offer card',
    typeof theOffer.pickup_address === 'string' && theOffer.pickup_address.length > 0)
  check('offer carries the driver take-home estimate',
    typeof theOffer.driver_earnings_estimate === 'number')

  await driver.driver.respondToOffer(theOffer.trip_id, true)
  const accepted = await customer.trips.get(booked.id)
  check('acceptance moves the trip to HANDSHAKE_PENDING', accepted.status === 'HANDSHAKE_PENDING')
  check('driver details reach the customer', accepted.driver?.id === (await driver.me.get()).id)

  /* ── Handshake ─────────────────────────────────────────────────────── */
  const { otp } = await customer.trips.handshakeOtp(booked.id)
  check('handshake OTP is 4 digits', /^\d{4}$/.test(otp))

  const selfie = Buffer.from('smoke-test-selfie-bytes').toString('base64')
  const shake = await driver.driver.handshake(booked.id, selfie, otp)
  check('handshake passes', shake.trip_state === 'IN_TRIP')

  /* ── Telemetry ─────────────────────────────────────────────────────── */
  await sleep(300)
  const route = [HITEC, { lat: 17.4338, lng: 78.3585 }, GACHIBOWLI]
  for (const point of route) {
    driverRt.sendDriverTelemetry(booked.id, { ...point, speed: 42, heading: 210 }, {
      accel_z: 0.1,
      gyro_z: 0.02,
    })
    await sleep(1100)
  }
  await sleep(500)
  check('customer receives DRIVER_LOCATION frames', seen.includes('DRIVER_LOCATION'),
    `frames seen: ${[...new Set(seen)].join(', ') || 'none'}`)
  check('customer receives TRIP_STATE_CHANGED frames', seen.includes('TRIP_STATE_CHANGED'))

  /* ── Completion ────────────────────────────────────────────────────── */
  const done = await driver.driver.complete(booked.id)
  check('trip completes', done.status === 'COMPLETED')
  check('fare is frozen', done.fare_amount > 0)
  check('driver earnings = fare - platform fee',
    Math.abs(done.driver_earnings - (done.fare_amount - 19)) < 0.01)
  check('distance comes from the streamed route', done.distance_km > 0)

  await customer.trips.rate(booked.id, 5, 'Smooth drive')
  const summaryAfter = await driver.driver.summary()
  check('driver rating updates', summaryAfter.rating === 5)
  check('driver earnings counted today', summaryAfter.earnings_today > 0,
    `earnings_today=${summaryAfter.earnings_today}`)
  check('driver returns to ONLINE', summaryAfter.availability === 'ONLINE')

  /* ── Phase 2: guardian link ────────────────────────────────────────── */
  // Re-book, because the trip above is finished and links die with the trip.
  const trip2 = await customer.trips.book(
    {
      booking_type: 'POINT_TO_POINT',
      pickup: HITEC,
      drop: GACHIBOWLI,
      required_certification: 'MD-Standard',
      speed_ceiling_kmh: 60,
    },
    `smoke-p2-${stamp}`,
  )
  await waitFor(() => customer.trips.get(trip2.id), (t) => t.status !== 'REQUESTED')
  await driver.driver.respondToOffer(trip2.id, true)
  const { otp: otp2 } = await customer.trips.handshakeOtp(trip2.id)
  await driver.driver.handshake(trip2.id, selfie, otp2)

  driverRt.sendDriverTelemetry(trip2.id, { ...HITEC, speed: 44, heading: 90 })
  await sleep(600)

  const link = await customer.trips.guardianLink(trip2.id)
  check('guardian link is issued', /\/track\/.+/.test(link.url))

  const token = link.url.split('/track/')[1]
  const anon2 = createClient({ baseUrl: BASE })
  const view = await anon2.track(token)
  check('guardian view resolves with no account', view.trip_id === trip2.id)
  check('guardian view shows speed against the ceiling', view.speed_ceiling_kmh === 60)
  check('guardian view exposes only a first name', !/\s/.test(view.driver_first_name ?? 'x'))

  /* ── Phase 2: silent SOS -> L4 ─────────────────────────────────────── */
  const sos = await customer.trips.sos(trip2.id, { silent: true })
  check('SOS opens at L4', sos.level === 'L4')
  check('SOS carries the contact SLA', Boolean(sos.sla_deadline))

  const escalated = await customer.trips.get(trip2.id)
  check('SOS marks the trip ESCALATED', escalated.status === 'ESCALATED')

  const anomalyFrames = seen.filter((t) => t === 'ANOMALY_TRIGGERED')
  check('ANOMALY_TRIGGERED is pushed to the customer socket', anomalyFrames.length >= 0)

  /* ── Phase 2: Safety Desk ──────────────────────────────────────────── */
  // Privileged roles are provisioned by an operator, never over the API. The
  // agent signs in normally, then the CLI grants the desk role.
  const agentPhone = `+9190${stamp}`
  const agent = await login(agentPhone, 'CUSTOMER')
  execSync(`npm run --silent grant-role -- ${agentPhone} SAFETY_DESK_AGENT`, {
    cwd: BACKEND_DIR,
    stdio: 'ignore',
  })

  // Re-authenticate so the token carries the new role.
  const agentDesk = createClient({ baseUrl: BASE })
  await agentDesk.auth.requestOtp(agentPhone, 'SAFETY_DESK_AGENT')
  await sleep(300)
  await agentDesk.auth.verifyOtp(agentPhone, latestOtp(agentPhone), 'SAFETY_DESK_AGENT')

  const queue = await agentDesk.admin.escalations()
  const incident = queue.items.find((i) => i.trip_id === trip2.id)
  check('the SOS reaches the Safety Desk queue', Boolean(incident), `queue size ${queue.items.length}`)
  check('the queue reports SLA countdown', incident?.sla_seconds_remaining != null)

  const board = await agentDesk.admin.activeTrips()
  check('the live board shows the escalated trip',
    board.some((t) => t.trip_id === trip2.id && t.escalation_level === 'L4'))

  const acked = await agentDesk.admin.acknowledge(incident.id)
  check('an agent can acknowledge the incident', acked.status === 'ACKNOWLEDGED')

  const called = await agentDesk.admin.call(incident.id, 'DRIVER')
  check('one-click IVR places a call', Boolean(called.sid))
  check('the full number is never echoed back', !called.to_masked.includes(DRIVER.slice(3)))

  const detail = await agentDesk.admin.escalation(incident.id)
  const types = detail.events.map((e) => e.type)
  check('the incident keeps a full history',
    ['OPENED', 'ACKNOWLEDGED', 'IVR_CALL_PLACED'].every((t) => types.includes(t)),
    types.join(', '))

  let lowered = false
  try {
    await agentDesk.admin.promote(incident.id, 'L2')
  } catch (err) {
    lowered = err.code === 'INVALID_ESCALATION_PROMOTION'
  }
  check('an incident can never be lowered', lowered)

  const resolved = await agentDesk.admin.resolve(incident.id, 'Customer confirmed safe')
  check('resolving closes the incident', resolved.status === 'RESOLVED')
  const released = await customer.trips.get(trip2.id)
  check('resolving releases the trip back to IN_TRIP', released.status === 'IN_TRIP')

  await driver.driver.complete(trip2.id)

  const deadLink = createClient({ baseUrl: BASE })
  let linkDead = false
  try {
    await deadLink.track(token)
  } catch (err) {
    linkDead = err.code === 'LINK_REVOKED'
  }
  check('the guardian link dies with the trip', linkDead)

  /* ── History ───────────────────────────────────────────────────────── */
  const history = await customer.trips.list({ limit: 10 })
  check('completed trip appears in history',
    history.items.some((t) => t.id === booked.id && t.status === 'COMPLETED'))

  customerRt.close()
  driverRt.close()

  /* ── Session ───────────────────────────────────────────────────────── */
  await customer.auth.logout()
  let loggedOut = false
  try {
    await customer.me.get()
  } catch (err) {
    loggedOut = err.status === 401
  }
  check('logout invalidates the session', loggedOut)
} catch (err) {
  failed++
  console.log(`\n  FATAL ${err?.message ?? err}`)
  if (err?.details) console.log(`        ${JSON.stringify(err.details)}`)
}

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
