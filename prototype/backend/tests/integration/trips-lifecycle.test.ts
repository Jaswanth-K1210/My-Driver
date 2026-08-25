import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/client.js'
import { seed } from '../../src/db/seed.js'
import { awaitDispatchIdle } from '../../src/modules/trips/dispatch-tracker.js'
import { expireStaleOffers } from '../../src/modules/trips/sweeper.js'
import { bearer, loginAs } from '../helpers/auth.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'
import {
  BOOK_BODY, eventTypes, GACHIBOWLI, makeCustomer, makeOnlineDriver, SELFIE, tripStatus,
  type Actor,
} from '../helpers/trips.js'

describe('trip lifecycle', () => {
  let app: FastifyInstance
  let customer: Actor
  let driver: Actor

  beforeAll(async () => { app = await buildApp(); await app.ready() })
  beforeEach(async () => {
    await resetDb(); await resetRedis(); await seed()
    customer = await makeCustomer(app, '+919876543210')
    driver = await makeOnlineDriver(app, '+919848012345')
  })
  afterAll(async () => { await app.close() })

  const book = (body: unknown = BOOK_BODY) =>
    app.inject({
      method: 'POST', url: '/v1/trips/book', headers: bearer(customer.accessToken), payload: body,
    })

  const respond = (tripId: string, accept: boolean, actor = driver) =>
    app.inject({
      method: 'POST', url: `/v1/trips/${tripId}/offer/respond`,
      headers: bearer(actor.accessToken), payload: { accept },
    })

  async function bookAndDispatch(): Promise<string> {
    const res = await book()
    const tripId = res.json().id as string
    await awaitDispatchIdle()
    return tripId
  }

  describe('dispatch', () => {
    it('offers the trip to a nearby certified driver and moves it to MATCHED', async () => {
      const tripId = await bookAndDispatch()

      expect(await tripStatus(tripId)).toBe('MATCHED')
      const { rows } = await pool.query(
        `SELECT driver_id, status, round FROM trip_offers WHERE trip_id = $1`, [tripId],
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].driver_id).toBe(driver.userId)
      expect(rows[0].status).toBe('PENDING')
      expect(rows[0].round).toBe(1)
      expect(await eventTypes(tripId)).toContain('TRIP_MATCHED')
    })

    it('ends as NO_DRIVERS_FOUND when nobody is nearby', async () => {
      await app.inject({
        method: 'POST', url: '/v1/driver/availability',
        headers: bearer(driver.accessToken), payload: { availability: 'OFFLINE' },
      })
      const tripId = await bookAndDispatch()

      expect(await tripStatus(tripId)).toBe('NO_DRIVERS_FOUND')
      expect(await eventTypes(tripId)).toContain('TRIP_NO_DRIVERS_FOUND')
    })

    it('never offers to a driver lacking the required certification', async () => {
      const tripId = (await book({ ...BOOK_BODY, required_certification: 'MD-Lux' })).json()
        .id as string
      await awaitDispatchIdle()

      expect(await tripStatus(tripId)).toBe('NO_DRIVERS_FOUND')
    })

    it('re-dispatches to the next driver when the first declines', async () => {
      // Placed further from the pickup than `driver`, so ranking is
      // deterministic. At identical coordinates the distance and score both
      // tie and GEORADIUS may return either driver first.
      const second = await makeOnlineDriver(app, '+919848012346', GACHIBOWLI)
      const tripId = await bookAndDispatch()

      const res = await respond(tripId, false)
      expect(res.statusCode).toBe(200)
      await awaitDispatchIdle()

      const { rows } = await pool.query(
        `SELECT driver_id, status FROM trip_offers WHERE trip_id = $1 ORDER BY round`, [tripId],
      )
      expect(rows[0].status).toBe('DECLINED')
      expect(rows).toHaveLength(2)
      expect(rows[1].driver_id).toBe(second.userId)
      expect(await tripStatus(tripId)).toBe('MATCHED')
    })

    it('gives up after every nearby driver has declined', async () => {
      const tripId = await bookAndDispatch()
      await respond(tripId, false)
      await awaitDispatchIdle()

      expect(await tripStatus(tripId)).toBe('NO_DRIVERS_FOUND')
    })

    it('accepting moves the trip to HANDSHAKE_PENDING and marks the driver ON_TRIP', async () => {
      const tripId = await bookAndDispatch()

      const res = await respond(tripId, true)
      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('HANDSHAKE_PENDING')
      expect(res.json().driver_id).toBe(driver.userId)

      const { rows } = await pool.query(
        `SELECT availability FROM driver_profiles WHERE user_id = $1`, [driver.userId],
      )
      expect(rows[0].availability).toBe('ON_TRIP')
      expect(await eventTypes(tripId)).toContain('OFFER_ACCEPTED')
    })

    it('refuses a driver with no offer on that trip', async () => {
      const tripId = await bookAndDispatch()
      // Far outside the 5 km radius, so dispatch can never have offered to them.
      const other = await makeOnlineDriver(app, '+919848012347', { lat: 17.9, lng: 78.9 })

      expect((await respond(tripId, true, other)).statusCode).toBe(404)
    })

    it('refuses a CUSTOMER token', async () => {
      const tripId = await bookAndDispatch()
      const res = await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/offer/respond`,
        headers: bearer(customer.accessToken), payload: { accept: true },
      })
      expect(res.statusCode).toBe(403)
    })

    it('sweeper expires a stale offer and returns the trip to the pool', async () => {
      const tripId = await bookAndDispatch()
      await pool.query(
        `UPDATE trip_offers SET expires_at = now() - interval '1 second' WHERE trip_id = $1`,
        [tripId],
      )

      const swept = await expireStaleOffers()
      expect(swept).toBe(1)

      const { rows } = await pool.query(
        `SELECT status FROM trip_offers WHERE trip_id = $1 ORDER BY round`, [tripId],
      )
      expect(rows[0].status).toBe('EXPIRED')
      expect(await eventTypes(tripId)).toContain('OFFER_EXPIRED')
    })
  })

  describe('handshake', () => {
    async function toHandshake(): Promise<{ tripId: string; otp: string }> {
      const tripId = await bookAndDispatch()
      await respond(tripId, true)
      const otpRes = await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/handshake-otp`,
        headers: bearer(customer.accessToken),
      })
      return { tripId, otp: otpRes.json().otp as string }
    }

    const handshake = (tripId: string, otp: string, actor = driver) =>
      app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/handshake`,
        headers: bearer(actor.accessToken),
        payload: { driver_selfie_base64: SELFIE, otp },
      })

    it('issues a 4-digit OTP to the customer only', async () => {
      const { otp } = await toHandshake()
      expect(otp).toMatch(/^\d{4}$/)
    })

    it('passes with the right code and moves the trip to IN_TRIP', async () => {
      const { tripId, otp } = await toHandshake()
      const res = await handshake(tripId, otp)

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ status: 'HANDSHAKE_PASSED', trip_state: 'IN_TRIP' })
      expect(await tripStatus(tripId)).toBe('IN_TRIP')

      const { rows } = await pool.query(
        `SELECT payload FROM trip_events WHERE trip_id = $1 AND type = 'HANDSHAKE_PASSED'`,
        [tripId],
      )
      // The selfie key is recorded; the base64 image never is.
      expect(rows[0].payload.selfie_key).toMatch(/^handshake\//)
      expect(JSON.stringify(rows[0].payload)).not.toContain(SELFIE)
    })

    it('rejects a wrong code and counts the attempt', async () => {
      const { tripId, otp } = await toHandshake()
      const wrong = otp === '0000' ? '1111' : '0000'

      const res = await handshake(tripId, wrong)
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('INVALID_HANDSHAKE_OTP')

      const { rows } = await pool.query(`SELECT handshake_attempts FROM trips WHERE id = $1`, [
        tripId,
      ])
      expect(rows[0].handshake_attempts).toBe(1)
    })

    it('locks permanently after 5 failed attempts', async () => {
      const { tripId, otp } = await toHandshake()
      const wrong = otp === '0000' ? '1111' : '0000'
      for (let i = 0; i < 5; i++) await handshake(tripId, wrong)

      const res = await handshake(tripId, otp)
      expect(res.statusCode).toBe(423)
      expect(res.json().error.code).toBe('HANDSHAKE_LOCKED')
      expect(await tripStatus(tripId)).toBe('HANDSHAKE_PENDING')
    })

    it('refuses a driver who is not on the trip', async () => {
      const { tripId, otp } = await toHandshake()
      const other = await makeOnlineDriver(app, '+919848012348', { lat: 17.9, lng: 78.9 })
      expect((await handshake(tripId, otp, other)).statusCode).toBe(404)
    })

    it('refuses when the trip is not in HANDSHAKE_PENDING', async () => {
      const { tripId, otp } = await toHandshake()
      await handshake(tripId, otp)

      const again = await handshake(tripId, otp)
      expect(again.statusCode).toBe(409)
      expect(again.json().error.code).toBe('INVALID_TRIP_STATE')
    })

    it('refuses a CUSTOMER token', async () => {
      const { tripId, otp } = await toHandshake()
      const res = await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/handshake`,
        headers: bearer(customer.accessToken),
        payload: { driver_selfie_base64: SELFIE, otp },
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('completion, cancellation, history and rating', () => {
    async function toInTrip(): Promise<string> {
      const tripId = await bookAndDispatch()
      await respond(tripId, true)
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
      return tripId
    }

    const complete = (tripId: string, actor = driver) =>
      app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/complete`, headers: bearer(actor.accessToken),
      })

    it('completes with a frozen fare and driver earnings', async () => {
      const tripId = await toInTrip()
      const res = await complete(tripId)

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.status).toBe('COMPLETED')
      expect(body.completed_at).toBeTruthy()
      expect(body.fare_amount).toBeGreaterThan(0)
      expect(body.driver_earnings).toBeCloseTo(body.fare_amount - 19, 2)
      expect(body.duration_min).toBeGreaterThanOrEqual(1)
    })

    it('falls back to the booking estimate when no telemetry was recorded', async () => {
      const tripId = await toInTrip()
      const body = (await complete(tripId)).json()
      expect(body.distance_km).toBeCloseTo(body.estimated_distance_km, 2)
    })

    it('returns the driver to ONLINE and increments total_trips', async () => {
      const tripId = await toInTrip()
      await complete(tripId)

      const { rows } = await pool.query(
        `SELECT availability, total_trips FROM driver_profiles WHERE user_id = $1`,
        [driver.userId],
      )
      expect(rows[0].availability).toBe('ONLINE')
      expect(rows[0].total_trips).toBe(1)
    })

    it('refuses to complete a trip that has not passed the handshake', async () => {
      const tripId = await bookAndDispatch()
      await respond(tripId, true) // HANDSHAKE_PENDING: driver is assigned, trip not started
      const res = await complete(tripId)
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('INVALID_TRIP_TRANSITION')
    })

    it('refuses a driver who is not on the trip', async () => {
      const tripId = await toInTrip()
      const other = await makeOnlineDriver(app, '+919848012349', { lat: 17.9, lng: 78.9 })
      expect((await complete(tripId, other)).statusCode).toBe(404)
    })

    it('cancels before the trip starts and records the reason', async () => {
      const tripId = await bookAndDispatch()
      const res = await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/cancel`,
        headers: bearer(customer.accessToken), payload: { reason: 'Changed my mind' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('CANCELLED')

      const { rows } = await pool.query(
        `SELECT cancellation_reason, cancelled_by FROM trips WHERE id = $1`, [tripId],
      )
      expect(rows[0].cancellation_reason).toBe('Changed my mind')
      expect(rows[0].cancelled_by).toBe(customer.userId)
    })

    it('refuses to cancel once the trip is under way', async () => {
      const tripId = await toInTrip()
      const res = await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/cancel`,
        headers: bearer(customer.accessToken), payload: { reason: 'too late' },
      })
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('TRIP_NOT_CANCELLABLE')
    })

    it('rates a completed trip and updates the driver rating', async () => {
      const tripId = await toInTrip()
      await complete(tripId)

      const res = await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/rate`,
        headers: bearer(customer.accessToken), payload: { rating: 5, comment: 'Great drive' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().rating).toBe(5)
      expect(res.json().driver_rating).toBe(5)
    })

    it('refuses a second rating on the same trip', async () => {
      const tripId = await toInTrip()
      await complete(tripId)
      const rate = () =>
        app.inject({
          method: 'POST', url: `/v1/trips/${tripId}/rate`,
          headers: bearer(customer.accessToken), payload: { rating: 4 },
        })
      await rate()
      const second = await rate()
      expect(second.statusCode).toBe(409)
      expect(second.json().error.code).toBe('ALREADY_RATED')
    })

    it('refuses to rate a trip that is not completed', async () => {
      const tripId = await toInTrip()
      const res = await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/rate`,
        headers: bearer(customer.accessToken), payload: { rating: 5 },
      })
      expect(res.statusCode).toBe(409)
    })

    it('rejects a rating outside 1-5', async () => {
      const tripId = await toInTrip()
      for (const rating of [0, 6]) {
        const res = await app.inject({
          method: 'POST', url: `/v1/trips/${tripId}/rate`,
          headers: bearer(customer.accessToken), payload: { rating },
        })
        expect(res.statusCode).toBe(400)
      }
    })

    it('reports the driver summary with today earnings', async () => {
      const tripId = await toInTrip()
      const fare = (await complete(tripId)).json()

      const res = await app.inject({
        method: 'GET', url: '/v1/driver/summary', headers: bearer(driver.accessToken),
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().trips_today).toBe(1)
      expect(res.json().earnings_today).toBeCloseTo(fare.driver_earnings, 2)
      expect(res.json().total_trips).toBe(1)
    })

    it('lists the caller trips newest first, and never another customer trips', async () => {
      await bookAndDispatch()
      const other = await makeCustomer(app, '+919876543299')

      const mine = await app.inject({
        method: 'GET', url: '/v1/trips', headers: bearer(customer.accessToken),
      })
      expect(mine.json().items).toHaveLength(1)

      const theirs = await app.inject({
        method: 'GET', url: '/v1/trips', headers: bearer(other.accessToken),
      })
      expect(theirs.json().items).toHaveLength(0)
    })

    it('paginates by keyset with no overlap and no gap', async () => {
      const ids: string[] = []
      for (let i = 0; i < 3; i++) {
        const res = await book({ ...BOOK_BODY, speed_ceiling_kmh: 60 + i })
        ids.push(res.json().id as string)
        await awaitDispatchIdle()
      }

      const first = await app.inject({
        method: 'GET', url: '/v1/trips?limit=2', headers: bearer(customer.accessToken),
      })
      expect(first.json().items).toHaveLength(2)
      expect(first.json().next_cursor).toBeTruthy()

      const second = await app.inject({
        method: 'GET',
        url: `/v1/trips?limit=2&cursor=${encodeURIComponent(first.json().next_cursor)}`,
        headers: bearer(customer.accessToken),
      })
      expect(second.json().items).toHaveLength(1)
      expect(second.json().next_cursor).toBeNull()

      const seen = [...first.json().items, ...second.json().items].map((t: { id: string }) => t.id)
      expect(new Set(seen).size).toBe(3)
      expect(seen.sort()).toEqual(ids.sort())
    })

    it('returns a trip to either participant and 404 to anyone else', async () => {
      const tripId = await bookAndDispatch()
      await respond(tripId, true)

      for (const actor of [customer, driver]) {
        const res = await app.inject({
          method: 'GET', url: `/v1/trips/${tripId}`, headers: bearer(actor.accessToken),
        })
        expect(res.statusCode).toBe(200)
      }

      const stranger = await makeCustomer(app, '+919876543288')
      const res = await app.inject({
        method: 'GET', url: `/v1/trips/${tripId}`, headers: bearer(stranger.accessToken),
      })
      expect(res.statusCode).toBe(404)
    })

    it('records the full ledger in order across the whole lifecycle', async () => {
      const tripId = await toInTrip()
      await complete(tripId)
      await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/rate`,
        headers: bearer(customer.accessToken), payload: { rating: 5 },
      })

      const { rows } = await pool.query<{ type: string }>(
        `SELECT type FROM trip_events WHERE trip_id = $1 ORDER BY created_at, id`, [tripId],
      )
      expect(rows.map((r) => r.type)).toEqual([
        'TRIP_REQUESTED',
        'TRIP_MATCHED',
        'OFFER_ACCEPTED',
        'HANDSHAKE_PASSED',
        'TRIP_COMPLETED',
        'TRIP_RATED',
      ])
    })

    it('refuses any attempt to rewrite the ledger', async () => {
      const tripId = await bookAndDispatch()
      await expect(
        pool.query(`UPDATE trip_events SET type = 'TAMPERED' WHERE trip_id = $1`, [tripId]),
      ).rejects.toThrow(/append-only/)
      await expect(
        pool.query(`DELETE FROM trip_events WHERE trip_id = $1`, [tripId]),
      ).rejects.toThrow(/append-only/)
    })
  })
})
