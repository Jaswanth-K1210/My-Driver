import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { seed } from '../../src/db/seed.js'
import { awaitDispatchIdle } from '../../src/modules/trips/dispatch-tracker.js'
import { MockMapsProvider, setMapsProvider } from '../../src/providers/maps/index.js'
import { redis } from '../../src/redis/client.js'
import { getTelemetryWriter } from '../../src/telemetry/batch-writer.js'
import { pool } from '../../src/db/client.js'
import { bearer } from '../helpers/auth.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'
import { BOOK_BODY, makeCustomer, makeOnlineDriver, SELFIE, type Actor } from '../helpers/trips.js'

describe('user app upgrade APIs', () => {
  let app: FastifyInstance
  let customer: Actor

  beforeAll(async () => { app = await buildApp(); await app.ready() })
  beforeEach(async () => {
    await resetDb(); await resetRedis(); await seed()
    customer = await makeCustomer(app, '+919811100001')
  })
  afterAll(async () => { await app.close() })

  const call = (method: string, url: string, payload?: unknown, token = customer.accessToken) =>
    app.inject({ method: method as 'GET', url, headers: bearer(token), ...(payload ? { payload } : {}) })

  const CAR = { company: 'Hyundai', model: 'Creta', engine_type: 'Diesel', transmission: 'Automatic', plate: 'ts09 ab 1234' }

  /* ── Garage ─────────────────────────────────────────────────────────── */

  describe('garage', () => {
    it('adds, lists, updates and deletes a car, normalising the plate', async () => {
      const added = await call('POST', '/v1/me/vehicles', CAR)
      expect(added.statusCode).toBe(201)
      expect(added.json()).toMatchObject({ plate: 'TS09AB1234', is_default: true })

      const id = added.json().id
      const patched = await call('PATCH', `/v1/me/vehicles/${id}`, { nickname: 'Family car', plate: null })
      expect(patched.json()).toMatchObject({ nickname: 'Family car', plate: null })

      expect((await call('GET', '/v1/me/vehicles')).json()).toHaveLength(1)
      expect((await call('DELETE', `/v1/me/vehicles/${id}`)).statusCode).toBe(204)
      expect((await call('GET', '/v1/me/vehicles')).json()).toHaveLength(0)
    })

    it('keeps exactly one default, and promotes another when the default is deleted', async () => {
      const a = (await call('POST', '/v1/me/vehicles', CAR)).json()
      const b = (await call('POST', '/v1/me/vehicles', { ...CAR, plate: 'TS10XY9999', is_default: true })).json()
      let list = (await call('GET', '/v1/me/vehicles')).json()
      expect(list.filter((v: { is_default: boolean }) => v.is_default).map((v: { id: string }) => v.id)).toEqual([b.id])

      await call('DELETE', `/v1/me/vehicles/${b.id}`)
      list = (await call('GET', '/v1/me/vehicles')).json()
      expect(list[0]).toMatchObject({ id: a.id, is_default: true })
    })

    it('rejects a duplicate plate and an unknown fuel type', async () => {
      await call('POST', '/v1/me/vehicles', CAR)
      const dup = await call('POST', '/v1/me/vehicles', { ...CAR, plate: 'TS09-AB-1234' })
      expect(dup.statusCode).toBe(409)
      expect(dup.json().error.code).toBe('VEHICLE_DUPLICATE_PLATE')
      expect((await call('POST', '/v1/me/vehicles', { ...CAR, plate: null, engine_type: 'Steam' })).statusCode).toBe(400)
    })

    it("never shows or changes another person's car", async () => {
      const mine = (await call('POST', '/v1/me/vehicles', CAR)).json()
      const other = await makeCustomer(app, '+919811100002')
      expect((await call('GET', '/v1/me/vehicles', undefined, other.accessToken)).json()).toHaveLength(0)
      expect((await call('PATCH', `/v1/me/vehicles/${mine.id}`, { nickname: 'x' }, other.accessToken)).statusCode).toBe(404)
      expect((await call('DELETE', `/v1/me/vehicles/${mine.id}`, undefined, other.accessToken)).statusCode).toBe(404)
    })
  })

  /* ── Catalogue ─────────────────────────────────────────────────────── */

  describe('trip config', () => {
    it('serves the trip options publicly, with a working ETag', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/catalogue/trip-config' })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.requirements.map((r: { id: string }) => r.id)).toEqual(['within_city', 'inter_city', 'airport', 'full_time'])
      expect(body.hour_packages[0]).toMatchObject({ id: 'h1', hours: 1, included_km: 10 })
      expect(body.pickup_times.length).toBeGreaterThan(0)
      // VisionCam is listed but unavailable: nothing behind it exists yet.
      expect(body.vision_modes.every((m: { available: boolean }) => m.available === false)).toBe(true)
      expect(body.rate_cards.length).toBeGreaterThan(0)

      const again = await app.inject({ method: 'GET', url: '/v1/catalogue/trip-config', headers: { 'if-none-match': res.headers.etag as string } })
      expect(again.statusCode).toBe(304)
    })
  })

  /* ── Locations ─────────────────────────────────────────────────────── */

  describe('location search', () => {
    it('proxies the first search and serves the repeat from cache', async () => {
      const maps = new MockMapsProvider()
      setMapsProvider(maps)
      const first = await call('GET', '/v1/locations/search?q=Cyber%20Towers&lat=17.44&lng=78.38')
      expect(first.statusCode).toBe(200)
      expect(first.json()).toMatchObject({ cached: false })
      expect(first.json().results[0]).toMatchObject({ name: 'Cyber Towers' })

      // Different case and spacing, a few metres away: the same cache entry.
      const second = await call('GET', '/v1/locations/search?q=%20cyber%20%20towers&lat=17.441&lng=78.381')
      expect(second.json()).toMatchObject({ cached: true })
      expect(maps.calls).toBe(1)
      setMapsProvider(undefined)
    })

    it('requires sign-in and a sensible query', async () => {
      expect((await app.inject({ method: 'GET', url: '/v1/locations/search?q=airport' })).statusCode).toBe(401)
      expect((await call('GET', '/v1/locations/search?q=a')).statusCode).toBe(400)
      expect((await call('GET', '/v1/locations/search?q=airport&lat=17.4')).statusCode).toBe(400)
    })

    it('returns 503, not 500, when the maps provider is down', async () => {
      setMapsProvider({ name: 'google', search: async () => { throw new Error('boom') } })
      const res = await call('GET', '/v1/locations/search?q=charminar')
      expect(res.statusCode).toBe(503)
      setMapsProvider(undefined)
    })
  })

  /* ── Background telemetry ──────────────────────────────────────────── */

  describe('background telemetry batch', () => {
    async function activeTrip(): Promise<{ tripId: string; driver: Actor }> {
      const driver = await makeOnlineDriver(app, '+919811100009')
      const booked = await call('POST', '/v1/trips/book', BOOK_BODY)
      const tripId = booked.json().id
      await awaitDispatchIdle()
      await call('POST', `/v1/trips/${tripId}/offer/respond`, { accept: true }, driver.accessToken)
      const otp = (await call('POST', `/v1/trips/${tripId}/handshake-otp`)).json().otp
      await call('POST', `/v1/trips/${tripId}/handshake`, { driver_selfie_base64: SELFIE, otp }, driver.accessToken)
      return { tripId, driver }
    }

    const fix = (t: number, lat: number) => ({ timestamp: t, coords: { lat, lng: 78.38, speed: 30 } })

    it('accepts a batch, thins it to 1 point per second and moves the last-known position', async () => {
      const { tripId, driver } = await activeTrip()
      const now = Date.now()
      const points = [fix(now - 3000, 17.441), fix(now - 2500, 17.4415), fix(now - 2000, 17.442), fix(now - 1000, 17.443)]
      const res = await call('POST', `/v1/trips/${tripId}/telemetry`, { sent_at: now, points }, driver.accessToken)
      expect(res.statusCode).toBe(202)
      expect(res.json()).toEqual({ accepted: 3, dropped: 1 })

      const last = JSON.parse((await redis.get(`trip:{${tripId}}:last:driver`))!)
      expect(last.lat).toBe(17.443)

      await getTelemetryWriter().flush()
      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM telematics_logs WHERE trip_id = $1`, [tripId])
      expect(rows[0].n).toBe(3)
    })

    it('rebases a phone with a wrong clock onto server time', async () => {
      const { tripId, driver } = await activeTrip()
      const phoneNow = Date.now() - 10 * 60_000 // phone clock 10 minutes slow
      await call('POST', `/v1/trips/${tripId}/telemetry`, { sent_at: phoneNow, points: [fix(phoneNow - 2000, 17.45)] }, driver.accessToken)
      const last = JSON.parse((await redis.get(`trip:{${tripId}}:last:driver`))!)
      // ~2 s old on the server clock, not 10 minutes stale.
      expect(Date.now() - last.at).toBeLessThan(10_000)
    })

    it('refuses non-participants and trips that are not active', async () => {
      const { tripId } = await activeTrip()
      const stranger = await makeCustomer(app, '+919811100003')
      const now = Date.now()
      expect((await call('POST', `/v1/trips/${tripId}/telemetry`, { sent_at: now, points: [fix(now, 17.44)] }, stranger.accessToken)).statusCode).toBe(403)

      const idle = (await call('POST', '/v1/trips/book', BOOK_BODY, stranger.accessToken)).json().id
      await awaitDispatchIdle()
      expect((await call('POST', `/v1/trips/${idle}/telemetry`, { sent_at: now, points: [fix(now, 17.44)] }, stranger.accessToken)).statusCode).toBe(409)
    })
  })
})
