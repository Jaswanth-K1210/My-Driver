import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createClient } from '../src/lib/api.js'
import { DEFAULT_CONFIG, bookingPayloadFor, serverQuote } from '../src/lib/booking.js'
import { toViewTrip } from '../src/lib/tripView.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const USER_APP_ROOT = resolve(__dirname, '..')
const E2E_DIR = resolve(USER_APP_ROOT, 'e2e')

describe('Customer App · Layer 3 Maestro E2E Suite & Driver Simulation', () => {
  it('defines all 6 critical customer Maestro YAML flows and suite.yaml', () => {
    const requiredFlows = [
      '01-sign-in.yaml',
      '02-book-within-city.yaml',
      '03-driver-matched-and-arrived.yaml',
      '04-share-pickup-otp.yaml',
      '05-complete-and-rate.yaml',
      '06-cancel-trip.yaml',
      'suite.yaml',
    ]

    for (const file of requiredFlows) {
      const fullPath = resolve(E2E_DIR, file)
      assert.equal(existsSync(fullPath), true, `Missing Maestro flow: ${file}`)
      const content = readFileSync(fullPath, 'utf8')
      assert.match(content, /^appId:\s*\$\{APP_ID\s*\|\|\s*'com\.mydriver\.user\.dev'\}/m)
      assert.match(content, /^---$/m)
    }

    const suiteContent = readFileSync(resolve(E2E_DIR, 'suite.yaml'), 'utf8')
    for (const flow of requiredFlows.slice(0, 6)) {
      assert.ok(suiteContent.includes(`runFlow: ${flow}`), `suite.yaml must run ${flow}`)
    }
  })

  it('verifies every UI selector in the Maestro flows matches the React Native screen source code', () => {
    const readScreen = (rel) => readFileSync(resolve(USER_APP_ROOT, rel), 'utf8')

    const loginSrc = readScreen('src/screens/auth/LoginScreen.jsx')
    const flow01 = readFileSync(resolve(E2E_DIR, '01-sign-in.yaml'), 'utf8')
    for (const selector of [
      'MyDriver',
      'Welcome back',
      'Phone OTP',
      'Mobile number, 10 digits',
      'Send OTP',
      'Code sent',
      'Code digit 1',
      'Code digit 6',
      'Verify',
    ]) {
      assert.ok(flow01.includes(selector), `01-sign-in.yaml missing selector "${selector}"`)
    }
    assert.ok(loginSrc.includes('Mobile number, 10 digits'))
    assert.ok(loginSrc.includes('Send OTP'))
    assert.ok(loginSrc.includes('Code sent'))
    assert.ok(loginSrc.includes('Code digit ${index + 1}'))
    assert.ok(loginSrc.includes('Verify'))

    const homeSrc = readScreen('src/screens/customer/HomeScreen.jsx')
    const paymentSrc = readScreen('src/screens/customer/PaymentScreen.jsx')
    const matchingSrc = readScreen('src/screens/customer/MatchingScreen.jsx')
    const tripViewSrc = readScreen('src/lib/tripView.js')
    const flow02 = readFileSync(resolve(E2E_DIR, '02-book-within-city.yaml'), 'utf8')
    for (const selector of [
      'What do you need?',
      'Price estimate',
      'Estimated total',
      'Confirm and pay',
      'REFUNDABLE HOLD',
      'Pay securely',
      'Cancel booking',
      'Matching a certified driver…',
      'Cancel request',
    ]) {
      assert.ok(flow02.includes(selector), `02-book-within-city.yaml missing selector "${selector}"`)
    }
    assert.ok(homeSrc.includes('title="What do you need?"'))
    assert.ok(homeSrc.includes('title="Price estimate"'))
    assert.ok(homeSrc.includes('Estimated total'))
    assert.ok(paymentSrc.includes('Confirm and pay'))
    assert.ok(paymentSrc.includes('REFUNDABLE HOLD'))
    assert.ok(paymentSrc.includes('Pay securely'))
    assert.ok(paymentSrc.includes('Cancel booking'))
    assert.ok(matchingSrc.includes('Matching a certified driver…'))
    assert.ok(matchingSrc.includes('Cancel request'))

    const liveSrc = readScreen('src/screens/customer/LiveTripScreen.jsx')
    const flow03 = readFileSync(resolve(E2E_DIR, '03-driver-matched-and-arrived.yaml'), 'utf8')
    const flow04 = readFileSync(resolve(E2E_DIR, '04-share-pickup-otp.yaml'), 'utf8')
    const flow06 = readFileSync(resolve(E2E_DIR, '06-cancel-trip.yaml'), 'utf8')
    for (const selector of [
      'PICKUP CODE',
      'YOUR DRIVER HAS ARRIVED',
      'Driver at pickup',
      'Get a new pickup code',
      'MAX SPEED',
      'FARE LOCKED',
      'Share live link',
      'Hold for SOS',
      'Cancel this trip?',
      'Free until your driver arrives. The hold on your card is released.',
      'Your driver is already at the pickup. Cancel anyway?',
      'Keep riding',
    ]) {
      assert.ok(liveSrc.includes(selector), `LiveTripScreen.jsx missing expected text "${selector}"`)
    }
    assert.ok(tripViewSrc.includes("IN_TRIP: 'On the way'"))
    assert.ok(flow03.includes('PICKUP CODE'))
    assert.ok(flow03.includes('YOUR DRIVER HAS ARRIVED'))
    assert.ok(flow04.includes('Get a new pickup code'))
    assert.ok(flow04.includes('On the way.*'))
    assert.ok(flow06.includes('Cancel this trip?'))
    assert.ok(flow06.includes('Your driver is already at the pickup. Cancel anyway?'))

    const completeSrc = readScreen('src/screens/customer/TripCompleteScreen.jsx')
    const flow05 = readFileSync(resolve(E2E_DIR, '05-complete-and-rate.yaml'), 'utf8')
    for (const selector of [
      'You have arrived',
      'Final fare',
      'Rate your driver to finish',
      'Submit & finish',
    ]) {
      assert.ok(completeSrc.includes(selector), `TripCompleteScreen.jsx missing "${selector}"`)
      assert.ok(flow05.includes(selector), `05-complete-and-rate.yaml missing "${selector}"`)
    }
  })

  it('executes all 6 critical customer E2E flows end-to-end through createClient + driver-sim.mjs', async () => {
    const tempLog = resolve(E2E_DIR, '.api.test.log')
    const stateFile = resolve(E2E_DIR, '.e2e-state.json')
    writeFileSync(tempLog, '', 'utf8')

    // In-memory backend state mirroring the Fastify routes in prototype/backend
    const otps = new Map()
    const users = new Map()
    const tokens = new Map()
    const trips = new Map()
    const payments = new Map()
    let onlineDriverId = null

    const server = createServer(async (req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      const chunks = []
      for await (const c of req) chunks.push(c)
      const raw = Buffer.concat(chunks).toString('utf8')
      const body = raw ? JSON.parse(raw) : {}
      const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
      const session = tokens.get(auth)

      const json = (status, payload) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(payload))
      }

      // 1. Auth OTP request & verify
      if (req.method === 'POST' && url.pathname === '/v1/auth/otp/request') {
        const code = '654321'
        otps.set(`${body.phone_number}:${body.role}`, code)
        writeFileSync(
          tempLog,
          `${readFileSync(tempLog, 'utf8')}[OTP] ${body.phone_number}: Your MyDriver code is ${code}\n`,
          'utf8',
        )
        return json(200, { sent: true })
      }

      if (req.method === 'POST' && url.pathname === '/v1/auth/otp/verify') {
        const expected = otps.get(`${body.phone_number}:${body.role}`)
        if (!expected || expected !== body.otp) {
          return json(401, { error: { code: 'INVALID_OTP', message: 'Invalid OTP' } })
        }
        let user = users.get(`${body.phone_number}:${body.role}`)
        if (!user) {
          user = {
            id: randomUUID(),
            phone_number: body.phone_number,
            role: body.role,
            full_name: body.role === 'DRIVER' ? 'Raju Chauffeur' : 'Sanath Customer',
          }
          users.set(`${body.phone_number}:${body.role}`, user)
        }
        const accessToken = `tok_${randomUUID()}`
        tokens.set(accessToken, user)
        return json(200, {
          access_token: accessToken,
          refresh_token: `ref_${randomUUID()}`,
          user,
        })
      }

      if (req.method === 'GET' && url.pathname === '/v1/me') {
        if (!session) return json(401, { error: { code: 'UNAUTHORIZED', message: 'No session' } })
        return json(200, session)
      }

      // 2. Driver availability & offers
      if (req.method === 'POST' && url.pathname === '/v1/driver/availability') {
        if (body.availability === 'ONLINE') onlineDriverId = session.id
        else if (onlineDriverId === session?.id) onlineDriverId = null
        return json(200, {
          availability: body.availability,
          dispatchable: body.availability === 'ONLINE' && Boolean(body.location),
        })
      }

      if (req.method === 'GET' && url.pathname === '/v1/driver/offers') {
        const pending = [...trips.values()].filter(
          (t) => t.status === 'REQUESTED' && t.payment_authorized,
        )
        return json(
          200,
          pending.map((t) => ({ trip_id: t.id, pickup_address: t.pickup_address })),
        )
      }

      // 3. Trip quote & book
      if (req.method === 'POST' && url.pathname === '/v1/trips/quote') {
        return json(200, {
          distance_km: 6.4,
          required_certification: 'MD-Standard',
          tier_label: 'Standard',
          fare: {
            base_fare: 320,
            platform_fee: 19,
            night_fee: 0,
            stops_fee: 0,
            total: 339,
          },
        })
      }

      if (req.method === 'POST' && url.pathname === '/v1/trips/book') {
        const tripId = randomUUID()
        const paymentId = randomUUID()
        const payment = {
          id: paymentId,
          trip_id: tripId,
          provider: 'mock',
          provider_order_id: `ord_${tripId.slice(0, 8)}`,
          provider_payment_id: null,
          status: 'CREATED',
          amount_authorized: 339,
          amount_captured: 0,
          amount_refunded: 0,
          amount_due: 0,
          amount_due_paid: 0,
          failure_reason: null,
          checkout_url: `/v1/payments/${paymentId}/checkout`,
          created_at: new Date().toISOString(),
        }
        const trip = {
          id: tripId,
          customer_id: session.id,
          driver_id: null,
          status: 'REQUESTED',
          booking_type: body.booking_type,
          pickup: body.pickup,
          pickup_address: body.pickup_address,
          drop: body.drop,
          drop_address: body.drop_address,
          required_certification: 'MD-Standard',
          speed_ceiling_kmh: body.speed_ceiling_kmh,
          estimated_distance_km: 6.4,
          estimated_fare: 339,
          fare_amount: null,
          distance_km: null,
          duration_min: null,
          arrived_at: null,
          completed_at: null,
          requested_at: new Date().toISOString(),
          handshake_otp: '4821',
          payment_authorized: false,
          vehicle_specs: body.car_details || null,
          driver: null,
        }
        trips.set(tripId, trip)
        payments.set(paymentId, payment)
        return json(201, { ...trip, payment })
      }

      if (req.method === 'GET' && url.pathname === '/v1/trips') {
        const items = [...trips.values()]
          .filter((t) => t.customer_id === session?.id)
          .reverse()
        return json(200, { items, next_cursor: null })
      }

      // 4. Payment lookup & mock approval
      const tripPayMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/payment$/)
      if (req.method === 'GET' && tripPayMatch) {
        const payment = [...payments.values()].find((p) => p.trip_id === tripPayMatch[1])
        return json(200, { payment })
      }

      const approveMatch = url.pathname.match(/^\/v1\/payments\/([^/]+)\/mock\/approve$/)
      if (req.method === 'POST' && approveMatch) {
        const payment = payments.get(approveMatch[1])
        payment.status = 'AUTHORIZED'
        payment.provider_payment_id = `pay_mock_${payment.id.slice(0, 6)}`
        const trip = trips.get(payment.trip_id)
        trip.payment_authorized = true
        return json(200, { status: 'AUTHORIZED', payment })
      }

      // 5. Trip lifecycle routes
      const offerMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/offer\/respond$/)
      if (req.method === 'POST' && offerMatch) {
        const trip = trips.get(offerMatch[1])
        trip.status = 'HANDSHAKE_PENDING'
        trip.driver_id = session.id
        trip.driver = {
          name: 'Raju Chauffeur',
          initials: 'RC',
          vehicle_model: null,
          vehicle_plate: null,
          rating: 4.9,
          mydriver_score: 95,
        }
        return json(200, trip)
      }

      const telemetryMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/telemetry$/)
      if (req.method === 'POST' && telemetryMatch) {
        const trip = trips.get(telemetryMatch[1])
        trip.arrived_at = new Date().toISOString()
        return json(202, { accepted: body.points?.length || 1 })
      }

      const otpMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/handshake-otp$/)
      if (req.method === 'POST' && otpMatch) {
        const trip = trips.get(otpMatch[1])
        trip.handshake_otp = '7392'
        return json(200, { otp: trip.handshake_otp })
      }

      const handshakeMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/handshake$/)
      if (req.method === 'POST' && handshakeMatch) {
        const trip = trips.get(handshakeMatch[1])
        if (body.otp !== trip.handshake_otp) {
          return json(401, { error: { code: 'INVALID_HANDSHAKE_OTP', message: 'Wrong pickup code' } })
        }
        trip.status = 'IN_TRIP'
        return json(200, { status: 'HANDSHAKE_PASSED', trip_state: 'IN_TRIP' })
      }

      const completeMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/complete$/)
      if (req.method === 'POST' && completeMatch) {
        const trip = trips.get(completeMatch[1])
        trip.status = 'COMPLETED'
        trip.fare_amount = 339
        trip.distance_km = 6.4
        trip.duration_min = 24
        trip.completed_at = new Date().toISOString()
        const payment = [...payments.values()].find((p) => p.trip_id === trip.id)
        if (payment) {
          payment.status = 'CAPTURED'
          payment.amount_captured = 339
        }
        return json(200, trip)
      }

      const rateMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/rate$/)
      if (req.method === 'POST' && rateMatch) {
        return json(200, { rating: body.rating, driver_rating: 4.95 })
      }

      const cancelMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)\/cancel$/)
      if (req.method === 'POST' && cancelMatch) {
        const trip = trips.get(cancelMatch[1])
        const arrived = Boolean(trip.arrived_at)
        trip.status = 'CANCELLED'
        trip.cancellation_fee = arrived ? 150 : 0
        trip.fare_amount = arrived ? 150 : 0
        const payment = [...payments.values()].find((p) => p.trip_id === trip.id)
        if (payment) {
          if (arrived) {
            payment.status = 'CAPTURED'
            payment.amount_captured = 150
          } else {
            payment.status = 'RELEASED'
          }
        }
        return json(200, trip)
      }

      const tripGetMatch = url.pathname.match(/^\/v1\/trips\/([^/]+)$/)
      if (req.method === 'GET' && tripGetMatch) {
        const trip = trips.get(tripGetMatch[1])
        return json(200, trip)
      }

      return json(404, { error: { code: 'NOT_FOUND', message: `Unhandled ${req.method} ${url.pathname}` } })
    })

    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address()
    const baseUrl = `http://127.0.0.1:${port}`

    process.env.API_URL = baseUrl
    process.env.API_LOG = tempLog
    const sim = await import(`../e2e/driver-sim.mjs?t=${Date.now()}`)

    try {
      const phone = '9876543210'
      const client = createClient({ baseUrl })

      // ── Flow 01: Customer Phone OTP Sign-In ───────────────────────────────
      await client.auth.requestOtp(`+91${phone}`, 'CUSTOMER')
      const loginOtp = await sim.otpFor(phone)
      assert.equal(loginOtp, '654321')
      const authRes = await client.auth.verifyOtp(`+91${phone}`, loginOtp, 'CUSTOMER')
      assert.ok(authRes.access_token)
      assert.equal(await client.hasSession(), true)

      // ── Flow 02: Book Within City & Authorize Hold ────────────────────────
      const quote = await serverQuote(client, {
        ...DEFAULT_CONFIG,
        carDetails: {
          company: 'Maruti Suzuki',
          model: 'Swift',
          engineType: 'Petrol',
          transmission: 'Manual',
          plate: '',
        },
      })
      assert.equal(quote.fare.total, 339)

      const booked = await client.trips.book(
        bookingPayloadFor({
          ...DEFAULT_CONFIG,
          carDetails: {
            company: 'Maruti Suzuki',
            model: 'Swift',
            engineType: 'Petrol',
            transmission: 'Manual',
            plate: '',
          },
        }),
      )
      assert.equal(booked.status, 'REQUESTED')
      assert.equal(booked.payment.status, 'CREATED')

      const approved = await sim.approveLatestPayment({ tripId: booked.id, phone })
      assert.equal(approved.status, 'AUTHORIZED')
      const polledPay = await client.payments.forTrip(booked.id)
      assert.equal(polledPay.payment.status, 'AUTHORIZED')

      // ── Flow 03: See Driver Matched & Arrived ─────────────────────────────
      const accepted = await sim.driverAccept()
      assert.equal(accepted.tripId, booked.id)
      assert.equal(accepted.status, 'HANDSHAKE_PENDING')

      const matchedView = toViewTrip(await client.trips.get(booked.id))
      assert.equal(matchedView.statusLabel, 'Driver on the way')
      assert.equal(matchedView.driver.vehicle, 'Maruti Suzuki Swift')
      assert.equal(matchedView.driver.plate, null)

      const arrived = await sim.driverArrive({ tripId: booked.id })
      assert.ok(arrived.arrivedAt)

      // ── Flow 04: Share Pickup OTP & Start Trip ────────────────────────────
      const issuedOtp = await client.trips.handshakeOtp(booked.id)
      assert.equal(issuedOtp.otp.length, 4)

      const started = await sim.driverStart({ tripId: booked.id, otp: issuedOtp.otp, phone })
      assert.equal(started.trip_state, 'IN_TRIP')

      // ── Flow 05: Complete Trip & Rate 5 Stars ─────────────────────────────
      const completed = await sim.driverComplete({ tripId: booked.id })
      assert.equal(completed.status, 'COMPLETED')
      assert.equal(completed.fareAmount, 339)

      const rated = await client.trips.rate(booked.id, 5)
      assert.equal(rated.rating, 5)

      // ── Flow 06 Part A: Free Cancel Before Driver Arrival ─────────────────
      const tripCancelFree = await client.trips.book(bookingPayloadFor(DEFAULT_CONFIG))
      await sim.approveLatestPayment({ tripId: tripCancelFree.id, phone })
      await sim.driverAccept()
      const cancelledFree = await client.trips.cancel(tripCancelFree.id, 'Customer cancelled')
      assert.equal(cancelledFree.status, 'CANCELLED')
      assert.equal(cancelledFree.cancellation_fee, 0)
      const payFree = await client.payments.forTrip(tripCancelFree.id)
      assert.equal(payFree.payment.status, 'RELEASED')

      // ── Flow 06 Part B: Cancel After Driver Arrival (Arrival Fee) ─────────
      const tripCancelFee = await client.trips.book(bookingPayloadFor(DEFAULT_CONFIG))
      await sim.approveLatestPayment({ tripId: tripCancelFee.id, phone })
      await sim.driverAccept()
      await sim.driverArrive({ tripId: tripCancelFee.id })
      const cancelledPaid = await client.trips.cancel(tripCancelFee.id, 'Customer cancelled')
      assert.equal(cancelledPaid.status, 'CANCELLED')
      assert.equal(cancelledPaid.cancellation_fee, 150)
      const payFee = await client.payments.forTrip(tripCancelFee.id)
      assert.equal(payFee.payment.status, 'CAPTURED')
      assert.equal(payFee.payment.amount_captured, 150)
    } finally {
      server.close()
      rmSync(tempLog, { force: true })
      rmSync(stateFile, { force: true })
    }
  })
})
