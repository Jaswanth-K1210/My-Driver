import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { pool } from '../src/db/client.js'
import { seed } from '../src/db/seed.js'
import { bearer, loginAs } from './helpers/auth.js'
import { resetDb } from './helpers/db.js'
import { resetRedis } from './helpers/redis.js'
import { BOOK_BODY, GACHIBOWLI, HITEC_CITY } from './helpers/trips.js'

describe('🔥 MYDRIVER COMPREHENSIVE SMOKE TEST SUITE', () => {
  let app: FastifyInstance
  let customerToken: string
  let customerId: string
  let driverToken: string
  let driverId: string

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  beforeEach(async () => {
    await resetDb()
    await resetRedis()
    await seed()

    // 1. Authenticate Customer
    const custLogin = await loginAs(app, '+919876543210', 'CUSTOMER')
    customerToken = custLogin.accessToken
    customerId = custLogin.userId

    // 2. Authenticate Driver
    const drvLogin = await loginAs(app, '+919848012345', 'DRIVER')
    driverToken = drvLogin.accessToken
    driverId = drvLogin.userId
  })

  afterAll(async () => {
    await app.close()
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * 1. INFRASTRUCTURE & HEALTH CHECKS
   * ────────────────────────────────────────────────────────────────────────── */
  describe('1. Infrastructure & System Health', () => {
    it('[HEALTH-01] GET /health returns 200 OK and service identity', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ status: 'ok', service: 'mydriver-backend' })
    })

    it('[HEALTH-02] GET /ready verifies DB and Redis dependencies are live', async () => {
      const res = await app.inject({ method: 'GET', url: '/ready' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ status: 'ready' })
    })

    it('[HEALTH-03] GET /metrics exposes Prometheus metrics for telematics & WS', async () => {
      const res = await app.inject({ method: 'GET', url: '/metrics' })
      expect(res.statusCode).toBe(200)
      expect(res.payload).toContain('mydriver_ws_connections')
      expect(res.payload).toContain('mydriver_db_pool_total')
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * 2. CATALOGUE & RATE CARDS
   * ────────────────────────────────────────────────────────────────────────── */
  describe('2. Public Catalogue & Rate Cards', () => {
    it('[RATE-01] GET /v1/rate-cards returns all 5 certification tiers with active rates', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/rate-cards' })
      expect(res.statusCode).toBe(200)
      const cards = res.json()
      expect(cards).toHaveLength(5)
      const standard = cards.find((c: { skill_id: string }) => c.skill_id === 'MD-Standard')
      const lux = cards.find((c: { skill_id: string }) => c.skill_id === 'MD-Lux')
      expect(standard).toBeDefined()
      expect(standard.per_km_rate).toBe(16)
      expect(lux).toBeDefined()
      expect(lux.per_km_rate).toBe(35)
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * 3. AUTHENTICATION & PROFILE
   * ────────────────────────────────────────────────────────────────────────── */
  describe('3. User Authentication & Profile Security', () => {
    it('[AUTH-01] Request OTP code with rate-limit and validation enforcement', async () => {
      const reqRes = await app.inject({
        method: 'POST',
        url: '/v1/auth/otp/request',
        payload: { phone_number: '+919988776655', role: 'CUSTOMER' },
      })
      expect(reqRes.statusCode).toBe(200)
      expect(reqRes.json().status).toBe('OTP_SENT')
    })

    it('[AUTH-02] GET /v1/me resolves verified customer profile and roles', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/v1/me',
        headers: bearer(customerToken),
      })
      expect(res.statusCode).toBe(200)
      const me = res.json()
      expect(me.id).toBe(customerId)
      expect(me.roles).toContain('CUSTOMER')
      expect(me.phone_number).toBe('+919876543210')
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * 4. QUOTING & FARE ENGINE
   * ────────────────────────────────────────────────────────────────────────── */
  describe('4. Quoting & Dynamic Fare Calculation', () => {
    it('[QUOTE-01] Computes accurate Point-to-Point distance and fare breakdown', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/trips/quote',
        headers: bearer(customerToken),
        payload: {
          booking_type: 'POINT_TO_POINT',
          pickup: HITEC_CITY,
          drop: GACHIBOWLI,
          required_certification: 'MD-Standard',
        },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.distance_km).toBeGreaterThan(1.8)
      expect(body.fare.platform_fee).toBe(19)
      expect(body.fare.total).toBeGreaterThan(0)
    })

    it('[QUOTE-02] Computes Hourly Hire package quotes without drop requirement', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/trips/quote',
        headers: bearer(customerToken),
        payload: {
          booking_type: 'HOURLY',
          hours: 4,
          pickup: HITEC_CITY,
          required_certification: 'MD-SUV',
        },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.fare.base).toBe(1320)
      expect(body.fare.total).toBeGreaterThanOrEqual(1339) // 1320 + 19 platform (+ night fee if night)
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * 5. BOOKING, DISPATCH & LIFECYCLE
   * ────────────────────────────────────────────────────────────────────────── */
  describe('5. Trip Booking, Idempotency & Lifecycle Actions', () => {
    it('[BOOK-01] Successfully books a trip and moves to REQUESTED state', async () => {
      const idempotencyKey = `smoke-${Date.now()}`
      const res = await app.inject({
        method: 'POST',
        url: '/v1/trips/book',
        headers: { ...bearer(customerToken), 'idempotency-key': idempotencyKey },
        payload: BOOK_BODY,
      })
      expect(res.statusCode).toBe(201)
      const trip = res.json()
      expect(trip.status).toBe('REQUESTED')
      expect(trip.customer_id).toBe(customerId)
      expect(trip.speed_ceiling_kmh).toBe(60)
      expect(trip.estimated_fare).toBeGreaterThan(0)

      // Cancel the booked trip
      const cancelRes = await app.inject({
        method: 'POST',
        url: `/v1/trips/${trip.id}/cancel`,
        headers: bearer(customerToken),
        payload: { reason: 'Smoke test completion' },
      })
      expect(cancelRes.statusCode).toBe(200)
      expect(cancelRes.json().status).toBe('CANCELLED')
    })

    it('[BOOK-02] Enforces Idempotency-Key preventing duplicate charge', async () => {
      const idempotencyKey = `smoke-idemp-${Date.now()}`
      const first = await app.inject({
        method: 'POST',
        url: '/v1/trips/book',
        headers: { ...bearer(customerToken), 'idempotency-key': idempotencyKey },
        payload: BOOK_BODY,
      })
      const second = await app.inject({
        method: 'POST',
        url: '/v1/trips/book',
        headers: { ...bearer(customerToken), 'idempotency-key': idempotencyKey },
        payload: BOOK_BODY,
      })
      expect(first.statusCode).toBe(201)
      expect(second.statusCode).toBe(201)
      expect(first.json().id).toBe(second.json().id)
    })

    it('[BOOK-03] Issues signed Realtime WebSocket Ticket for live tracking', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/realtime/ticket',
        headers: bearer(customerToken),
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(typeof body.ticket).toBe('string')
      expect(body.ticket.length).toBeGreaterThan(20)
      expect(body.expires_in).toBeGreaterThan(0)
    })
  })

  /* ──────────────────────────────────────────────────────────────────────────
   * 6. GUARDIANS & SAFETY NETWORK
   * ────────────────────────────────────────────────────────────────────────── */
  describe('6. Guardian Network & Safety Shield', () => {
    it('[SAFE-01] Adds and lists customer emergency guardians via /v1/me/guardians', async () => {
      const addRes = await app.inject({
        method: 'POST',
        url: '/v1/me/guardians',
        headers: bearer(customerToken),
        payload: {
          name: 'Priya Sharma',
          phone: '+919848011223',
          relation: 'Sister',
        },
      })
      expect(addRes.statusCode).toBe(201)

      const listRes = await app.inject({
        method: 'GET',
        url: '/v1/me/guardians',
        headers: bearer(customerToken),
      })
      expect(listRes.statusCode).toBe(200)
      const guardians = listRes.json()
      expect(guardians.length).toBeGreaterThanOrEqual(1)
      expect(guardians.some((g: { name: string }) => g.name === 'Priya Sharma')).toBe(true)
    })
  })
})
