import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/client.js'
import { seed } from '../../src/db/seed.js'
import { bearer, loginAs } from '../helpers/auth.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'
import { BOOK_BODY, GACHIBOWLI, HITEC_CITY } from '../helpers/trips.js'

describe('quote and booking', () => {
  let app: FastifyInstance
  let token: string
  let customerId: string

  beforeAll(async () => { app = await buildApp(); await app.ready() })
  beforeEach(async () => {
    await resetDb(); await resetRedis(); await seed()
    const login = await loginAs(app, '+919876543210', 'CUSTOMER')
    token = login.accessToken
    customerId = login.userId
  })
  afterAll(async () => { await app.close() })

  const quote = (payload: unknown, t = token) =>
    app.inject({ method: 'POST', url: '/v1/trips/quote', headers: bearer(t), payload })
  const book = (payload: unknown, headers: Record<string, string> = {}) =>
    app.inject({
      method: 'POST', url: '/v1/trips/book',
      headers: { ...bearer(token), ...headers }, payload,
    })

  describe('POST /v1/trips/quote', () => {
    it('returns an estimated distance and a fare breakdown', async () => {
      const res = await quote({
        booking_type: 'POINT_TO_POINT', pickup: HITEC_CITY, drop: GACHIBOWLI,
        required_certification: 'MD-Standard',
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      // ~1.429 km straight line x 1.35 road factor.
      expect(body.distance_km).toBeGreaterThan(1.85)
      expect(body.distance_km).toBeLessThan(2.0)
      expect(body.fare.platform_fee).toBe(19)
      expect(body.fare.total).toBeGreaterThan(0)
    })

    it('creates no trip record', async () => {
      await quote({
        booking_type: 'POINT_TO_POINT', pickup: HITEC_CITY, drop: GACHIBOWLI,
        required_certification: 'MD-Standard',
      })
      expect((await pool.query('SELECT count(*)::int AS n FROM trips')).rows[0].n).toBe(0)
    })

    it('quotes an hourly package without a drop location', async () => {
      const res = await quote({
        booking_type: 'HOURLY', hours: 4, pickup: HITEC_CITY,
        required_certification: 'MD-Lux',
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().fare.base).toBe(2080)
    })

    it('rejects a point-to-point quote with no drop', async () => {
      const res = await quote({
        booking_type: 'POINT_TO_POINT', pickup: HITEC_CITY,
        required_certification: 'MD-Standard',
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('DROP_REQUIRED')
    })

    it('rejects an unknown certification', async () => {
      const res = await quote({
        booking_type: 'POINT_TO_POINT', pickup: HITEC_CITY, drop: GACHIBOWLI,
        required_certification: 'MD-Rocket',
      })
      expect(res.statusCode).toBe(404)
      expect(res.json().error.code).toBe('UNKNOWN_SKILL')
    })

    it('rejects a request carrying a VisionCam mode', async () => {
      const res = await quote({
        booking_type: 'POINT_TO_POINT', pickup: HITEC_CITY, drop: GACHIBOWLI,
        required_certification: 'MD-Standard', mode: 'MODE_F',
      })
      expect(res.statusCode).toBe(400)
    })

    it('requires authentication', async () => {
      expect((await app.inject({ method: 'POST', url: '/v1/trips/quote', payload: {} })).statusCode)
        .toBe(401)
    })
  })

  describe('POST /v1/trips/book', () => {
    it('creates a trip in REQUESTED with an estimated fare', async () => {
      const res = await book(BOOK_BODY)
      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.status).toBe('REQUESTED')
      expect(body.customer_id).toBe(customerId)
      expect(body.driver_id).toBeNull()
      expect(body.speed_ceiling_kmh).toBe(60)
      expect(body.estimated_fare).toBeGreaterThan(0)
    })

    it('never returns the handshake OTP to the customer', async () => {
      const res = await book(BOOK_BODY)
      expect(res.payload).not.toContain('handshake_otp')
    })

    it('stores the handshake OTP hashed', async () => {
      await book(BOOK_BODY)
      const { rows } = await pool.query('SELECT pickup_handshake_otp_hash FROM trips')
      expect(rows[0].pickup_handshake_otp_hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('writes a TRIP_REQUESTED ledger entry', async () => {
      const res = await book(BOOK_BODY)
      const { rows } = await pool.query('SELECT type FROM trip_events WHERE trip_id = $1', [
        res.json().id,
      ])
      expect(rows.map((r) => r.type)).toContain('TRIP_REQUESTED')
    })

    it('is idempotent for a repeated Idempotency-Key', async () => {
      const first = await book(BOOK_BODY, { 'idempotency-key': 'abc-12345' })
      const second = await book(BOOK_BODY, { 'idempotency-key': 'abc-12345' })

      expect(second.statusCode).toBe(201)
      expect(second.json().id).toBe(first.json().id)
      expect((await pool.query('SELECT count(*)::int AS n FROM trips')).rows[0].n).toBe(1)
    })

    it('creates two trips for two different keys', async () => {
      await book(BOOK_BODY, { 'idempotency-key': 'key-00001' })
      await book(BOOK_BODY, { 'idempotency-key': 'key-00002' })
      expect((await pool.query('SELECT count(*)::int AS n FROM trips')).rows[0].n).toBe(2)
    })

    it('rejects a booking carrying a VisionCam mode', async () => {
      expect((await book({ ...BOOK_BODY, mode: 'MODE_F' })).statusCode).toBe(400)
    })

    it('rejects a speed ceiling outside 20-120', async () => {
      expect((await book({ ...BOOK_BODY, speed_ceiling_kmh: 5 })).statusCode).toBe(400)
      expect((await book({ ...BOOK_BODY, speed_ceiling_kmh: 200 })).statusCode).toBe(400)
    })

    it('refuses a DRIVER token', async () => {
      const driver = (await loginAs(app, '+919848012345', 'DRIVER')).accessToken
      const res = await app.inject({
        method: 'POST', url: '/v1/trips/book', headers: bearer(driver), payload: BOOK_BODY,
      })
      expect(res.statusCode).toBe(403)
    })

    it('refuses a customer with no verified phone number', async () => {
      await pool.query(
        `UPDATE users SET phone_number = NULL, phone_verified_at = NULL WHERE id = $1`,
        [customerId],
      )
      const res = await book(BOOK_BODY)
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('PHONE_VERIFICATION_REQUIRED')
    })
  })
})
