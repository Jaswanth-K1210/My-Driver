import type { FastifyInstance } from 'fastify'
import type WebSocket from 'ws'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/client.js'
import { seed } from '../../src/db/seed.js'
import { getTelemetryWriter } from '../../src/telemetry/batch-writer.js'
import { bearer } from '../helpers/auth.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'
import {
  BOOK_BODY, GACHIBOWLI, HITEC_CITY, makeCustomer, makeOnlineDriver, SELFIE, type Actor,
} from '../helpers/trips.js'
import { awaitDispatchIdle } from '../../src/modules/trips/dispatch-tracker.js'
import { closeWs, connectWs, expectWsRejected, nextFrame, sendFrame, waitForFrame } from '../helpers/ws.js'

describe('realtime gateway', () => {
  let app: FastifyInstance
  let customer: Actor
  let driver: Actor
  let tripId: string
  const sockets: WebSocket[] = []

  beforeAll(async () => {
    app = await buildApp()
    // Realtime tests need a real listening socket, not just app.ready().
    await app.listen({ port: 0, host: '127.0.0.1' })
  })
  afterAll(async () => { await app.close() })

  beforeEach(async () => {
    await resetDb(); await resetRedis(); await seed()
    customer = await makeCustomer(app, '+919876543210')
    driver = await makeOnlineDriver(app, '+919848012345')

    const booked = await app.inject({
      method: 'POST', url: '/v1/trips/book',
      headers: bearer(customer.accessToken), payload: BOOK_BODY,
    })
    tripId = booked.json().id as string
    await awaitDispatchIdle()
  })

  afterEach(async () => {
    await Promise.all(sockets.splice(0).map(closeWs))
  })

  const ticketFor = async (actor: Actor): Promise<string> => {
    const res = await app.inject({
      method: 'POST', url: '/v1/realtime/ticket', headers: bearer(actor.accessToken),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().expires_in).toBe(60)
    return res.json().ticket as string
  }

  const open = async (actor: Actor): Promise<WebSocket> => {
    const ws = await connectWs(app, await ticketFor(actor))
    sockets.push(ws)
    return ws
  }

  /** Drive the trip to IN_TRIP so telemetry is accepted. */
  async function startTrip(): Promise<void> {
    await app.inject({
      method: 'POST', url: `/v1/trips/${tripId}/offer/respond`,
      headers: bearer(driver.accessToken), payload: { accept: true },
    })
    const otp = (
      await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/handshake-otp`,
        headers: bearer(customer.accessToken),
      })
    ).json().otp as string
    await app.inject({
      method: 'POST', url: `/v1/trips/${tripId}/handshake`,
      headers: bearer(driver.accessToken),
      payload: { driver_selfie_base64: SELFIE, otp },
    })
  }

  const telemetry = (coords: { lat: number; lng: number }) => ({
    type: 'DRIVER_TELEMETRY',
    trip_id: tripId,
    timestamp: Date.now(),
    coords: { ...coords, speed: 48.5, heading: 182.4 },
    sensors: { accel_z: 0.12, gyro_z: 0.04 },
  })

  describe('connection', () => {
    it('accepts a valid ticket', async () => {
      const ws = await open(customer)
      expect(ws.readyState).toBe(ws.OPEN)
    })

    it('refuses an unknown ticket', async () => {
      expect(await expectWsRejected(app, 'not-a-real-ticket')).toBe(4401)
    })

    it('refuses a reused ticket — tickets are single use', async () => {
      const ticket = await ticketFor(customer)
      const first = await connectWs(app, ticket)
      sockets.push(first)

      expect(await expectWsRejected(app, ticket)).toBe(4401)
    })
  })

  describe('subscription authorisation', () => {
    it('lets a participant subscribe', async () => {
      const ws = await open(customer)
      sendFrame(ws, { type: 'SUBSCRIBE', trip_id: tripId })

      expect(await nextFrame(ws)).toEqual({ type: 'SUBSCRIBED', trip_id: tripId })
    })

    it('refuses a non-participant', async () => {
      const stranger = await makeCustomer(app, '+919876543288')
      const ws = await open(stranger)
      sendFrame(ws, { type: 'SUBSCRIBE', trip_id: tripId })

      expect(await nextFrame(ws)).toMatchObject({ type: 'ERROR', code: 'FORBIDDEN_TRIP' })
    })

    it('returns INVALID_FRAME for malformed input and keeps the socket open', async () => {
      const ws = await open(customer)
      ws.send('{not json')

      expect(await nextFrame(ws)).toMatchObject({ type: 'ERROR', code: 'INVALID_FRAME' })
      expect(ws.readyState).toBe(ws.OPEN)
    })

    it('rejects an unknown trip', async () => {
      const ws = await open(customer)
      sendFrame(ws, { type: 'SUBSCRIBE', trip_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' })

      expect(await nextFrame(ws)).toMatchObject({ type: 'ERROR', code: 'TRIP_NOT_FOUND' })
    })
  })

  describe('telemetry', () => {
    it('refuses telemetry before the trip is active', async () => {
      // Use the customer: on a MATCHED trip driver_id is still null, so a
      // driver would (correctly) be rejected as a non-participant instead.
      const ws = await open(customer)
      sendFrame(ws, {
        type: 'CUSTOMER_TELEMETRY',
        trip_id: tripId,
        timestamp: Date.now(),
        coords: { lat: HITEC_CITY.lat, lng: HITEC_CITY.lng },
      })

      expect(await nextFrame(ws)).toMatchObject({ type: 'ERROR', code: 'TRIP_NOT_ACTIVE' })
    })

    it('refuses a driver who has not yet accepted the offer', async () => {
      const ws = await open(driver)
      sendFrame(ws, telemetry(HITEC_CITY))

      expect(await nextFrame(ws)).toMatchObject({ type: 'ERROR', code: 'FORBIDDEN_TRIP' })
    })

    it('refuses driver telemetry sent from the customer connection', async () => {
      await startTrip()
      const ws = await open(customer)
      sendFrame(ws, telemetry(HITEC_CITY))

      expect(await nextFrame(ws)).toMatchObject({
        type: 'ERROR', code: 'WRONG_TELEMETRY_SOURCE',
      })
    })

    it('persists a valid driver frame and fans it out to the customer', async () => {
      await startTrip()

      const customerWs = await open(customer)
      sendFrame(customerWs, { type: 'SUBSCRIBE', trip_id: tripId })
      await nextFrame(customerWs)

      const driverWs = await open(driver)
      sendFrame(driverWs, telemetry(HITEC_CITY))

      const fanned = await waitForFrame(customerWs, 'DRIVER_LOCATION')
      expect(fanned).toMatchObject({
        type: 'DRIVER_LOCATION',
        trip_id: tripId,
        coords: { lat: HITEC_CITY.lat, lng: HITEC_CITY.lng },
      })

      await getTelemetryWriter().flush()
      const { rows } = await pool.query(
        `SELECT source, lat, lng, speed_kmh FROM telematics_logs WHERE trip_id = $1`, [tripId],
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].source).toBe('DRIVER')
      expect(Number(rows[0].speed_kmh)).toBeCloseTo(48.5, 1)
    })

    it('drops frames beyond one per second without closing the socket', async () => {
      await startTrip()
      const ws = await open(driver)

      for (let i = 0; i < 5; i++) sendFrame(ws, telemetry(HITEC_CITY))
      await new Promise((r) => setTimeout(r, 400))
      await getTelemetryWriter().flush()

      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM telematics_logs WHERE trip_id = $1`, [tripId],
      )
      expect(rows[0].n).toBe(1)
      expect(ws.readyState).toBe(ws.OPEN)
    })
  })

  describe('lifecycle broadcast', () => {
    it('pushes TRIP_STATE_CHANGED to a subscribed customer', async () => {
      const ws = await open(customer)
      sendFrame(ws, { type: 'SUBSCRIBE', trip_id: tripId })
      await nextFrame(ws)

      const pending = waitForFrame(ws, 'TRIP_STATE_CHANGED')
      await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/offer/respond`,
        headers: bearer(driver.accessToken), payload: { accept: true },
      })

      expect(await pending).toMatchObject({
        type: 'TRIP_STATE_CHANGED', trip_id: tripId, status: 'HANDSHAKE_PENDING',
      })
    })

    it('pushes COMPLETED when the driver ends the trip', async () => {
      await startTrip()
      const ws = await open(customer)
      sendFrame(ws, { type: 'SUBSCRIBE', trip_id: tripId })
      await nextFrame(ws)

      const pending = waitForFrame(ws, 'TRIP_STATE_CHANGED')
      await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/complete`, headers: bearer(driver.accessToken),
      })

      expect(await pending).toMatchObject({ status: 'COMPLETED' })
    })
  })

  describe('end to end with real telemetry', () => {
    it('computes the completed distance from the streamed route', async () => {
      await startTrip()
      const ws = await open(driver)

      // Three fixes, one second apart, along the HITEC City -> Gachibowli line.
      const mid = { lat: 17.4441, lng: 78.3864 }
      for (const point of [HITEC_CITY, mid, GACHIBOWLI]) {
        sendFrame(ws, telemetry(point))
        await new Promise((r) => setTimeout(r, 1050))
      }
      await getTelemetryWriter().flush()

      const res = await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/complete`, headers: bearer(driver.accessToken),
      })
      expect(res.statusCode).toBe(200)

      const body = res.json()
      // Travelled distance is the raw polyline (~1.43 km), not the 1.35x estimate.
      expect(body.distance_km).toBeGreaterThan(1.35)
      expect(body.distance_km).toBeLessThan(1.5)
      expect(body.distance_km).toBeLessThan(body.estimated_distance_km)
      expect(body.driver_earnings).toBeCloseTo(body.fare_amount - 19, 2)
    })
  })
})
