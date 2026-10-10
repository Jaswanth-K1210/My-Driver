/**
 * Demo data for exercising the operations console:
 *
 *   npm run seed:demo
 *
 * Creates 40 customers, 25 drivers across every onboarding state, ~30 days of
 * trips (completed, cancelled, no driver found, three live now), payments and
 * refunds, ratings, incidents (two open), night check-ins, assessments to
 * grade and a paid payout. Every demo account is marked users.is_demo.
 *
 * Hide all of it from the console with ADMIN_DEMO_DATA=hide (production
 * always hides it). It cannot be deleted: trip_events and audit_log are
 * append-only by design. Re-running is a no-op once demo data exists.
 *
 * Demo drivers are never put online or into the dispatch index, so a real
 * booking can never be offered to a fake driver.
 */
import { createHash, randomBytes } from 'node:crypto'
import type { PoolClient } from 'pg'
import { env } from '../config/env.js'
import { closeDb, pool } from './client.js'
import { closeRedis } from '../redis/client.js'
import { upsertDriverLocation } from '../modules/trips/geo-index.js'
import { seed } from './seed.js'

if (env.NODE_ENV === 'production') {
  console.error('seed:demo is disabled in production.')
  process.exit(1)
}

// Deterministic PRNG, so every run produces the same demo world.
let state = 20261010
const rand = () => ((state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296)
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!
const between = (lo: number, hi: number) => lo + rand() * (hi - lo)
const chance = (p: number) => rand() < p
const fakeHash = () => createHash('sha256').update(randomBytes(16)).digest('hex')

const FIRST = ['Aarav', 'Ananya', 'Vihaan', 'Diya', 'Arjun', 'Isha', 'Rohan', 'Kavya', 'Aditya', 'Meera', 'Karthik', 'Sneha', 'Rahul', 'Priya', 'Sai', 'Lakshmi', 'Nikhil', 'Pooja', 'Varun', 'Divya', 'Harsha', 'Swathi', 'Manoj', 'Keerthi']
const LAST = ['Reddy', 'Rao', 'Sharma', 'Naidu', 'Iyer', 'Gupta', 'Varma', 'Kumar', 'Patel', 'Menon', 'Chowdary', 'Desai']
const PLACES = [
  ['Cyber Towers, HITEC City', 17.4504, 78.3808], ['Inorbit Mall, Madhapur', 17.434, 78.3868],
  ['Financial District, Gachibowli', 17.4256, 78.332], ['Jubilee Hills Check Post', 17.4319, 78.4073],
  ['Banjara Hills Road No. 12', 17.4126, 78.4392], ['KPHB Colony, Kukatpally', 17.4849, 78.4138],
  ['Begumpet', 17.4447, 78.4664], ['Secunderabad Railway Station', 17.4344, 78.5015],
  ['Botanical Garden, Kondapur', 17.4587, 78.3582], ['Charminar', 17.3616, 78.4747],
  ['Ameerpet Metro', 17.4375, 78.4482], ['RGIA Shamshabad', 17.2403, 78.4294],
] as const
const CARS = [['Hyundai Creta', 'SUV'], ['Maruti Swift', 'Standard'], ['Honda City', 'Standard'], ['Toyota Innova', 'SUV'], ['Kia Seltos', 'Auto'], ['BMW 5 Series', 'Lux']] as const
const TIERS = [['MD-Standard', 16, 0.55], ['MD-Auto', 18, 0.15], ['MD-SUV', 22, 0.15], ['MD-Lux', 35, 0.05], ['MD-Night', 19, 0.1]] as const

function km(a: readonly [string, number, number], b: readonly [string, number, number]) {
  const r = Math.PI / 180
  const h = Math.sin(((b[1] - a[1]) * r) / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(((b[2] - a[2]) * r) / 2) ** 2
  return Math.max(2, 12742 * Math.asin(Math.sqrt(h)) * 1.35)
}
const plate = () => `TS${String(Math.floor(between(1, 16))).padStart(2, '0')} ${pick(['EA', 'FG', 'UB', 'MX', 'KC'])} ${Math.floor(between(1000, 9999))}`
const name = () => `${pick(FIRST)} ${pick(LAST)}`
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000)

async function user(c: PoolClient, phone: string, fullName: string, role: 'CUSTOMER' | 'DRIVER', createdAt: Date, email?: string) {
  const { rows } = await c.query<{ id: string }>(
    `INSERT INTO users (phone_number, full_name, email, phone_verified_at, created_at, is_demo)
     VALUES ($1, $2, $3, $4, $4, true) RETURNING id`,
    [phone, fullName, email ?? null, createdAt],
  )
  const id = rows[0]!.id
  await c.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, $2)`, [id, role])
  return id
}

async function kyc(c: PoolClient, userId: string, fullName: string, at: Date) {
  for (const kind of ['PAN', 'AADHAAR']) {
    await c.query(
      `INSERT INTO kyc_verifications (user_id, kind, status, provider, number_last4, name_on_record, name_match_score, verified_at, created_at)
       VALUES ($1, $2, 'VERIFIED', 'mock', $3, $4, 100, $5, $5)`,
      [userId, kind, String(Math.floor(between(1000, 9999))), fullName.toUpperCase(), at],
    )
  }
}

async function event(c: PoolClient, tripId: string, type: string, at: Date, actor: string | null, role: string | null, payload: object = {}) {
  await c.query(
    `INSERT INTO trip_events (trip_id, type, actor_id, actor_role, payload, created_at) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [tripId, type, actor, role, JSON.stringify(payload), at],
  )
}

/**
 * Driver positions live only in Redis, so they are (re)placed on every run:
 * drivers on a live demo trip sit between its pickup and drop, and a dozen
 * approved demo drivers go ONLINE around the city. Dispatch ignores demo
 * drivers, so real test bookings are never offered to them.
 */
async function placeOnMap() {
  const { rows: onTrip } = await pool.query<{ driver_id: string; lat: number; lng: number }>(
    `SELECT t.driver_id, (t.pickup_lat + t.drop_lat) / 2 AS lat, (t.pickup_lng + t.drop_lng) / 2 AS lng
       FROM trips t JOIN users u ON u.id = t.driver_id
      WHERE u.is_demo AND t.status IN ('MATCHED', 'HANDSHAKE_PENDING', 'IN_TRIP', 'ESCALATED')`,
  )
  for (const d of onTrip) await upsertDriverLocation(d.driver_id, { lat: Number(d.lat), lng: Number(d.lng) }, { force: true })

  const { rows: idle } = await pool.query<{ user_id: string }>(
    `UPDATE driver_profiles SET availability = 'ONLINE'
      WHERE user_id IN (SELECT dp.user_id FROM driver_profiles dp JOIN users u ON u.id = dp.user_id
                         WHERE u.is_demo AND dp.onboarding_status = 'APPROVED' AND dp.availability <> 'ON_TRIP'
                         ORDER BY dp.user_id LIMIT 12)
      RETURNING user_id`,
  )
  for (const [i, d] of idle.entries()) {
    const [, lat, lng] = PLACES[i % PLACES.length]!
    await upsertDriverLocation(d.user_id, { lat: lat + between(-0.008, 0.008), lng: lng + between(-0.008, 0.008) }, { force: true })
  }
  console.log(`demo map: ${onTrip.length} drivers on trips, ${idle.length} online`)
}

async function main() {
  await seed()
  const { rows: existing } = await pool.query(`SELECT count(*)::int AS n FROM users WHERE is_demo`)
  if (existing[0].n > 0) {
    console.log(`demo data already present (${existing[0].n} demo accounts)`)
    await placeOnMap()
    return
  }

  const c = await pool.connect()
  try {
    await c.query('BEGIN')

    /* Customers */
    const customers: string[] = []
    for (let i = 1; i <= 40; i++) {
      const n = name()
      const id = await user(c, `+9199991${String(i).padStart(5, '0')}`, n, 'CUSTOMER', minutesAgo(between(60 * 24, 60 * 24 * 90)),
        `${n.toLowerCase().replace(' ', '.')}${i}@demo.mydriver.test`)
      if (chance(0.35)) await kyc(c, id, n, minutesAgo(between(60, 60 * 24 * 30)))
      if (chance(0.5)) {
        await c.query(`INSERT INTO guardian_contacts (user_id, name, relation, phone, position) VALUES ($1, $2, $3, $4, 1)`,
          [id, name(), pick(['Mother', 'Father', 'Spouse', 'Sibling']), `+9198480${String(i).padStart(5, '0')}`])
      }
      if (chance(0.6)) {
        const [model] = pick(CARS)
        await c.query(
          `INSERT INTO saved_vehicles (user_id, company, model, engine_type, transmission, plate, is_default)
           VALUES ($1, $2, $3, $4, $5, $6, true)`,
          [id, model.split(' ')[0], model.split(' ').slice(1).join(' '), pick(['Petrol', 'Diesel', 'CNG']), pick(['Manual', 'Automatic']), plate().replace(/ /g, '')],
        )
      }
      customers.push(id)
    }

    /* Drivers across every onboarding state */
    const states = [...Array(15).fill('APPROVED'), 'UNDER_REVIEW', 'UNDER_REVIEW', 'UNDER_REVIEW', 'UNDER_REVIEW', 'PENDING', 'PENDING', 'TESTING', 'REJECTED', 'REJECTED', 'SUSPENDED'] as const
    const approved: string[] = []
    const testing: string[] = []
    for (let i = 0; i < states.length; i++) {
      const status = states[i]!
      const n = name()
      const joined = minutesAgo(between(60 * 24 * 5, 60 * 24 * 200))
      const id = await user(c, `+9199992${String(i + 1).padStart(5, '0')}`, n, 'DRIVER', joined)
      const [vehicle] = pick(CARS)
      const certs = ['MD-Standard', ...(chance(0.4) ? ['MD-SUV'] : []), ...(chance(0.3) ? ['MD-Auto'] : []), ...(chance(0.15) ? ['MD-Lux'] : []), ...(chance(0.3) ? ['MD-Night'] : [])]
      await c.query(
        `INSERT INTO driver_profiles (user_id, certifications, night_shield_certified, mydriver_score, rating, rating_count,
                                      vehicle_model, vehicle_plate, availability, onboarding_status, onboarded_at, review_note, updated_at)
         VALUES ($1, $2, $3, $4, $5, 0, $6, $7, 'OFFLINE', $8, $9, $10, now())`,
        [id, certs, certs.includes('MD-Night'), status === 'APPROVED' ? Math.round(between(78, 99)) : 70,
         status === 'APPROVED' ? Number(between(4.3, 4.95).toFixed(2)) : null, vehicle, plate(), status, joined,
         status === 'REJECTED' ? 'Licence photo unreadable; asked to re-apply' : status === 'SUSPENDED' ? 'Repeated speed-limit breaches, under review' : null],
      )
      if (status !== 'PENDING') await kyc(c, id, n, joined)
      if (status !== 'PENDING') {
        const docStatus = status === 'UNDER_REVIEW' ? 'SUBMITTED' : status === 'REJECTED' ? 'REJECTED' : 'VERIFIED'
        await c.query(
          `INSERT INTO driver_documents (driver_id, kind, storage_key, number_last4, expires_on, status, reject_reason, created_at)
           VALUES ($1, 'DRIVING_LICENCE', $2, $3, now() + interval '3 years', $4, $5, $6)`,
          [id, `demo/${id}/licence.jpg`, String(Math.floor(between(1000, 9999))), docStatus, docStatus === 'REJECTED' ? 'Photo is blurred' : null, joined],
        )
      }
      if (status === 'APPROVED') approved.push(id)
      if (status === 'TESTING') testing.push(id)
    }

    /* Assessments waiting to be graded */
    const { rows: tests } = await c.query<{ id: string }>(`SELECT id FROM assessments WHERE kind IN ('PRACTICAL', 'WRITTEN') ORDER BY code LIMIT 2`)
    for (const d of [...testing, approved[0]!]) {
      for (const t of tests) {
        await c.query(
          `INSERT INTO assessment_attempts (driver_id, assessment_id, attempt_no, answers, started_at, submitted_at)
           VALUES ($1, $2, 1, '{}'::jsonb, now() - interval '2 hours', now() - interval '1 hour')`,
          [d, t.id],
        )
      }
    }

    /* Trips: ~30 days of history, three live now */
    let trips = 0
    const completedByDriver = new Map<string, string[]>()
    const nightCompleted: string[] = []
    for (let day = 29; day >= 0; day--) {
      const perDay = Math.round(between(8, 16))
      for (let k = 0; k < perDay; k++) {
        const hour = chance(0.2) ? Math.floor(between(22, 27)) % 24 : Math.floor(between(7, 21))
        const at = new Date(Date.now() - day * 86_400_000)
        at.setHours(hour, Math.floor(between(0, 59)), 0, 0)
        if (at > new Date()) continue
        const from = pick(PLACES)
        let to = pick(PLACES)
        while (to === from) to = pick(PLACES)
        const dist = Number(km(from, to).toFixed(2))
        const tier = (() => { let x = rand(); for (const t of TIERS) { x -= t[2]; if (x <= 0) return t } return TIERS[0] })()
        const night = hour >= 22 || hour < 5
        const fare = Number((dist * tier[1] + 19 + (night ? 30 : 0)).toFixed(2))
        const r = rand()
        const status = r < 0.82 ? 'COMPLETED' : r < 0.93 ? 'CANCELLED' : 'NO_DRIVERS_FOUND'
        const customer = pick(customers)
        const driver = status === 'NO_DRIVERS_FOUND' || (status === 'CANCELLED' && chance(0.5)) ? null : pick(approved)
        const duration = Math.round((dist / 25) * 60 + between(5, 20))
        const done = new Date(at.getTime() + (duration + 8) * 60_000)

        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO trips (customer_id, driver_id, status, booking_type, pickup_lat, pickup_lng, pickup_address, drop_lat, drop_lng, drop_address,
                              required_certification, speed_ceiling_kmh, pickup_handshake_otp_hash, estimated_distance_km, estimated_fare,
                              distance_km, duration_min, fare_amount, platform_fee, night_fee, driver_earnings, requested_at, matched_at,
                              started_at, completed_at, cancelled_at, cancellation_reason, cancelled_by, requirement, trip_type, dispatch_round)
           VALUES ($1, $2, $3, 'POINT_TO_POINT', $4, $5, $6, $7, $8, $9, $10, 60, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
                   $22, $23, $24, $25, $26, 'within_city', 'one_way', 1)
           RETURNING id`,
          [customer, driver, status, from[1], from[2], from[0], to[1], to[2], to[0], tier[0], fakeHash(), dist, fare,
           status === 'COMPLETED' ? dist : null, status === 'COMPLETED' ? duration : null, status === 'COMPLETED' ? fare : null,
           status === 'COMPLETED' ? 19 : null, status === 'COMPLETED' ? (night ? 30 : 0) : null, status === 'COMPLETED' ? fare - 19 : null,
           at, driver ? new Date(at.getTime() + 40_000) : null, status === 'COMPLETED' ? new Date(at.getTime() + 8 * 60_000) : null,
           status === 'COMPLETED' ? done : null, status === 'CANCELLED' ? new Date(at.getTime() + 3 * 60_000) : null,
           status === 'CANCELLED' ? pick(['Plans changed', 'Driver taking too long', 'Booked by mistake']) : null,
           status === 'CANCELLED' ? customer : null],
        )
        const id = rows[0]!.id
        trips++
        await event(c, id, 'TRIP_REQUESTED', at, customer, 'CUSTOMER', { estimated_fare: fare })
        if (driver) {
          await event(c, id, 'TRIP_MATCHED', new Date(at.getTime() + 20_000), null, null, { driver_id: driver, round: 1 })
          await event(c, id, 'OFFER_ACCEPTED', new Date(at.getTime() + 40_000), driver, 'DRIVER')
        }
        const order = `order_demo_${id.slice(0, 12)}`
        if (status === 'COMPLETED') {
          await event(c, id, 'HANDSHAKE_PASSED', new Date(at.getTime() + 8 * 60_000), driver, 'DRIVER')
          await event(c, id, 'TRIP_COMPLETED', done, driver, 'DRIVER', { distance_km: dist, duration_min: duration, fare })
          const refunded = chance(0.04) ? Number((fare * 0.5).toFixed(2)) : 0
          await c.query(
            `INSERT INTO payments (trip_id, customer_id, provider, provider_order_id, provider_payment_id, amount_authorized, amount_captured,
                                   amount_refunded, status, created_at, updated_at)
             VALUES ($1, $2, 'mock', $3, $4, $5, $6, $7, $8, $9, $10)`,
            [id, customer, order, `pay_demo_${id.slice(0, 12)}`, fare, fare, refunded, 'CAPTURED', at, done],
          )
          if (chance(0.75)) {
            const stars = pick([5, 5, 5, 4, 4, 3])
            await c.query(`INSERT INTO driver_ratings (trip_id, driver_id, rating, comment, created_at) VALUES ($1, $2, $3, $4, $5)`,
              [id, driver, stars, stars < 4 ? pick(['Drove a bit fast', 'Arrived late']) : null, done])
          }
          completedByDriver.set(driver!, [...(completedByDriver.get(driver!) ?? []), id])
          if (night && day <= 1) nightCompleted.push(id)
        } else {
          await event(c, id, status === 'CANCELLED' ? 'TRIP_CANCELLED' : 'TRIP_NO_DRIVERS_FOUND', new Date(at.getTime() + 3 * 60_000), status === 'CANCELLED' ? customer : null, status === 'CANCELLED' ? 'CUSTOMER' : null)
          await c.query(
            `INSERT INTO payments (trip_id, customer_id, provider, provider_order_id, amount_authorized, status, created_at, updated_at)
             VALUES ($1, $2, 'mock', $3, $4, 'RELEASED', $5, $5)`,
            [id, customer, order, fare, at],
          )
        }
        // Past incidents, all resolved.
        if (status === 'COMPLETED' && chance(0.025)) {
          const level = pick(['L1', 'L1', 'L2', 'L3', 'L4'])
          const opened = new Date(at.getTime() + 20 * 60_000)
          await c.query(
            `INSERT INTO escalations (trip_id, level, status, reason, opened_at, sla_deadline, acknowledged_at, resolved_at, resolution)
             VALUES ($1, $2, 'RESOLVED', $3, $4::timestamptz, $4::timestamptz + interval '3 minutes',
                     $4::timestamptz + ($5 || ' seconds')::interval, $4::timestamptz + interval '25 minutes', $6)`,
            [id, level, pick(['SPEED_CEILING_BREACH', 'ROUTE_DEVIATION', 'UNUSUAL_STOP', 'SOS']), opened, String(Math.round(between(40, 260))),
             pick(['Called customer, all safe', 'Driver confirmed traffic diversion', 'False alarm, customer pressed SOS by mistake'])],
          )
        }
      }
    }

    /* Three trips in progress right now; two with open incidents */
    for (const [i, incident] of [[0, 'L2'], [1, 'L3'], [2, null]] as const) {
      const from = PLACES[i]!
      const to = PLACES[i + 5]!
      const customer = customers[i]!
      const driver = approved[i + 1]!
      const started = minutesAgo(12 + i * 9)
      const dist = Number(km(from, to).toFixed(2))
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO trips (customer_id, driver_id, status, booking_type, pickup_lat, pickup_lng, pickup_address, drop_lat, drop_lng, drop_address,
                            required_certification, speed_ceiling_kmh, pickup_handshake_otp_hash, estimated_distance_km, estimated_fare,
                            requested_at, matched_at, started_at, requirement, trip_type, dispatch_round)
         VALUES ($1, $2, 'IN_TRIP', 'POINT_TO_POINT', $3, $4, $5, $6, $7, $8, 'MD-Standard', 60, $9, $10, $11,
                 $12::timestamptz - interval '9 minutes', $12::timestamptz - interval '8 minutes', $12, 'within_city', 'one_way', 1)
         RETURNING id`,
        [customer, driver, from[1], from[2], from[0], to[1], to[2], to[0], fakeHash(), dist, Number((dist * 16 + 19).toFixed(2)), started],
      )
      const id = rows[0]!.id
      await c.query(`UPDATE driver_profiles SET availability = 'ON_TRIP' WHERE user_id = $1`, [driver])
      await event(c, id, 'TRIP_REQUESTED', new Date(started.getTime() - 9 * 60_000), customer, 'CUSTOMER')
      await event(c, id, 'TRIP_MATCHED', new Date(started.getTime() - 8 * 60_000), null, null, { driver_id: driver, round: 1 })
      await event(c, id, 'OFFER_ACCEPTED', new Date(started.getTime() - 8 * 60_000 + 15_000), driver, 'DRIVER')
      await event(c, id, 'HANDSHAKE_PASSED', started, driver, 'DRIVER')
      await c.query(
        `INSERT INTO payments (trip_id, customer_id, provider, provider_order_id, provider_payment_id, amount_authorized, status)
         VALUES ($1, $2, 'mock', $3, $4, $5, 'AUTHORIZED')`,
        [id, customer, `order_demo_${id.slice(0, 12)}`, `pay_demo_${id.slice(0, 12)}`, Number((dist * 16 + 19).toFixed(2))],
      )
      if (incident) {
        await c.query(
          `INSERT INTO escalations (trip_id, level, status, reason, opened_at, sla_deadline, acknowledged_at, details)
           VALUES ($1, $2, $3, $4, now() - interval '2 minutes', now() + interval '1 minute', $5, $6::jsonb)`,
          [id, incident, incident === 'L3' ? 'ACKNOWLEDGED' : 'OPEN', incident === 'L3' ? 'UNUSUAL_STOP' : 'SPEED_CEILING_BREACH',
           incident === 'L3' ? minutesAgo(1) : null, JSON.stringify(incident === 'L3' ? { stopped_minutes: 7 } : { speed_kmh: 84, ceiling_kmh: 60 })],
        )
      }
      trips++
    }

    /* Night check-ins due */
    for (const [i, tripId] of nightCompleted.slice(0, 4).entries()) {
      await c.query(`INSERT INTO post_trip_checkins (trip_id, due_at, outcome) VALUES ($1, now() - ($2 || ' minutes')::interval, 'PENDING')`, [tripId, String(5 + i * 7)])
    }

    /* One paid payout last fortnight, the rest unsettled */
    const payoutDriver = approved[0]!
    const owed = completedByDriver.get(payoutDriver) ?? []
    if (owed.length) {
      const { rows: sum } = await c.query(
        `SELECT count(*)::int AS n, sum(driver_earnings)::numeric AS gross, sum(platform_fee)::numeric AS fee FROM trips WHERE id = ANY($1::uuid[])`,
        [owed],
      )
      const { rows: po } = await c.query<{ id: string }>(
        `INSERT INTO driver_payouts (driver_id, period_start, period_end, trip_count, gross, platform_fee, net, status, reference, paid_at)
         VALUES ($1, current_date - 30, current_date - 1, $2, $3::numeric, $4::numeric, $3::numeric - $4::numeric, 'PAID', 'UTR DEMO 4412 8834', now() - interval '1 day')
         RETURNING id`,
        [payoutDriver, sum[0].n, sum[0].gross, sum[0].fee],
      )
      await c.query(`UPDATE trips SET payout_id = $1 WHERE id = ANY($2::uuid[])`, [po[0]!.id, owed])
    }

    // Driver aggregates follow the trips that were just written.
    await c.query(
      `UPDATE driver_profiles dp
          SET total_trips = s.n, rating = COALESCE(s.avg, dp.rating), rating_count = s.rated
         FROM (SELECT t.driver_id, count(*) FILTER (WHERE t.status = 'COMPLETED')::int AS n,
                      round(avg(r.rating), 2) AS avg, count(r.rating)::int AS rated
                 FROM trips t LEFT JOIN driver_ratings r ON r.trip_id = t.id
                WHERE t.driver_id IS NOT NULL GROUP BY t.driver_id) s
        WHERE dp.user_id = s.driver_id AND dp.user_id IN (SELECT id FROM users WHERE is_demo)`,
    )

    await c.query('COMMIT')
    console.log(`demo data seeded: 40 customers, ${states.length} drivers, ${trips} trips (3 live, 2 open incidents)`)
    await placeOnMap()
    console.log(`visible in the console while ADMIN_DEMO_DATA=show (current: ${env.ADMIN_DEMO_DATA})`)
  } catch (err) {
    await c.query('ROLLBACK')
    throw err
  } finally {
    c.release()
  }
}

await main()
await closeDb()
await closeRedis()
