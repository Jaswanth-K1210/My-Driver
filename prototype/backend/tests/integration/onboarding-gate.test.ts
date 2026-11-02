import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/client.js'
import { seed } from '../../src/db/seed.js'
import { awaitDispatchIdle } from '../../src/modules/trips/dispatch-tracker.js'
import { findNearbyDrivers } from '../../src/modules/trips/geo-index.js'
import { ConsolePushProvider, setPushProvider } from '../../src/providers/push/index.js'
import { bearer, loginAs } from '../helpers/auth.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'
import { loginAsRole } from '../helpers/safety.js'
import { BOOK_BODY, GACHIBOWLI, HITEC_CITY, makeCustomer, makeOnlineDriver, SELFIE, tripStatus } from '../helpers/trips.js'

/**
 * The onboarding gate and Night Shield are only controls if dispatch reads
 * them. These tests are what makes that true: without them, an admin could
 * suspend a driver and that driver would keep receiving trips.
 *
 * Everything routes through findNearbyDrivers, so it is asserted directly
 * rather than through a booking — the gate is the query, not the caller.
 */
describe('dispatch eligibility gates', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })
  beforeEach(async () => {
    await resetDb()
    await resetRedis()
    await seed()
  })
  afterAll(async () => {
    await app.close()
  })

  const setStatus = (userId: string, status: string) =>
    pool.query(`UPDATE driver_profiles SET onboarding_status = $2 WHERE user_id = $1`, [
      userId,
      status,
    ])

  const nearby = (night = false) =>
    findNearbyDrivers(HITEC_CITY, 5, 'MD-Standard', 10, night)

  it('offers trips to an approved driver', async () => {
    const driver = await makeOnlineDriver(app, '+919700000001')
    expect(await nearby()).toContain(driver.userId)
  })

  for (const status of ['PENDING', 'TESTING', 'UNDER_REVIEW', 'REJECTED', 'SUSPENDED']) {
    it(`never offers a trip to a ${status} driver, even when online and certified`, async () => {
      const driver = await makeOnlineDriver(app, '+919700000002')
      // Online, positioned, correctly certified — the ONLY thing wrong is the
      // onboarding state. If this driver is dispatchable, the gate does nothing.
      await setStatus(driver.userId, status)

      expect(await nearby()).not.toContain(driver.userId)
    })
  }

  it('excludes a driver without Night Shield from a night trip', async () => {
    const driver = await makeOnlineDriver(app, '+919700000003')
    await pool.query(
      `UPDATE driver_profiles SET night_shield_certified = false WHERE user_id = $1`,
      [driver.userId],
    )

    // Same driver, same position, same certification: only the window differs.
    expect(await nearby(false)).toContain(driver.userId)
    expect(await nearby(true)).not.toContain(driver.userId)
  })

  it('includes a Night Shield certified driver in a night trip', async () => {
    const driver = await makeOnlineDriver(app, '+919700000004')
    expect(await nearby(true)).toContain(driver.userId)
  })

  it('stops offering the moment a driver is suspended mid-shift', async () => {
    const driver = await makeOnlineDriver(app, '+919700000005')
    expect(await nearby()).toContain(driver.userId)

    // No re-index, no logout — an admin suspension alone must take effect.
    await setStatus(driver.userId, 'SUSPENDED')

    expect(await nearby()).not.toContain(driver.userId)
  })

  it("pushes the console's decision to the driver's phone", async () => {
    const driver = await makeOnlineDriver(app, '+919700000006')
    const ops = await loginAsRole(app, '+919700000016', 'OPS_MANAGER')
    // Installed only now: signing in swaps in its own provider.
    const push = new ConsolePushProvider()
    setPushProvider(push)
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/v1/admin/drivers/${driver.userId}/status`,
        headers: bearer(ops.accessToken),
        payload: { status: 'SUSPENDED' },
      })
      expect(res.statusCode).toBe(200)
      expect(push.sent).toEqual([
        expect.objectContaining({
          userId: driver.userId,
          payload: expect.objectContaining({ data: { type: 'ONBOARDING_STATUS', status: 'SUSPENDED' } }),
        }),
      ])
    } finally {
      setPushProvider(undefined)
    }
  })

  describe('operation-level driver approval enforcement (Scenario 12)', () => {
    it('rejects going ONLINE and fetching offers for unapproved drivers with 403 DRIVER_NOT_APPROVED', async () => {
      const pending = await loginAs(app, '+919700000010', 'DRIVER')

      const onlineRes = await app.inject({
        method: 'POST',
        url: '/v1/driver/availability',
        headers: bearer(pending.accessToken),
        payload: { availability: 'ONLINE', location: HITEC_CITY },
      })
      expect(onlineRes.statusCode).toBe(403)
      expect(onlineRes.json().error.code).toBe('DRIVER_NOT_APPROVED')

      // Going OFFLINE remains permitted regardless of approval status
      const offlineRes = await app.inject({
        method: 'POST',
        url: '/v1/driver/availability',
        headers: bearer(pending.accessToken),
        payload: { availability: 'OFFLINE' },
      })
      expect(offlineRes.statusCode).toBe(200)

      const offersRes = await app.inject({
        method: 'GET',
        url: '/v1/driver/offers',
        headers: bearer(pending.accessToken),
      })
      expect(offersRes.statusCode).toBe(403)
      expect(offersRes.json().error.code).toBe('DRIVER_NOT_APPROVED')
    })

    it('rejects offer acceptance and pickup handshake if driver is unapproved after dispatch', async () => {
      const customer = await makeCustomer(app, '+919700000011')
      const driver = await makeOnlineDriver(app, '+919700000012')

      const bookRes = await app.inject({
        method: 'POST',
        url: '/v1/trips/book',
        headers: bearer(customer.accessToken),
        payload: BOOK_BODY,
      })
      const tripId = bookRes.json().id as string
      await awaitDispatchIdle()

      // Suspend driver before accepting the offer
      await setStatus(driver.userId, 'SUSPENDED')

      const acceptRes = await app.inject({
        method: 'POST',
        url: `/v1/trips/${tripId}/offer/respond`,
        headers: bearer(driver.accessToken),
        payload: { accept: true },
      })
      expect(acceptRes.statusCode).toBe(403)
      expect(acceptRes.json().error.code).toBe('DRIVER_NOT_APPROVED')

      // Re-approve to accept offer, then suspend before handshake
      await setStatus(driver.userId, 'APPROVED')
      const okAccept = await app.inject({
        method: 'POST',
        url: `/v1/trips/${tripId}/offer/respond`,
        headers: bearer(driver.accessToken),
        payload: { accept: true },
      })
      expect(okAccept.statusCode).toBe(200)

      const otpRes = await app.inject({
        method: 'POST',
        url: `/v1/trips/${tripId}/handshake-otp`,
        headers: bearer(customer.accessToken),
      })
      const otp = otpRes.json().otp as string

      await setStatus(driver.userId, 'REJECTED')
      const hsRes = await app.inject({
        method: 'POST',
        url: `/v1/trips/${tripId}/handshake`,
        headers: bearer(driver.accessToken),
        payload: { driver_selfie_base64: SELFIE, otp },
      })
      expect(hsRes.statusCode).toBe(403)
      expect(hsRes.json().error.code).toBe('DRIVER_NOT_APPROVED')
    })

    it('raises an L2 Safety Desk escalation on mid-trip suspension, allows safe completion, and transitions driver OFFLINE', async () => {
      const customer = await makeCustomer(app, '+919700000013')
      const driver = await makeOnlineDriver(app, '+919700000014')
      const ops = await loginAsRole(app, '+919700000015', 'OPS_MANAGER')

      const bookRes = await app.inject({
        method: 'POST',
        url: '/v1/trips/book',
        headers: bearer(customer.accessToken),
        payload: BOOK_BODY,
      })
      const tripId = bookRes.json().id as string
      await awaitDispatchIdle()

      await app.inject({
        method: 'POST',
        url: `/v1/trips/${tripId}/offer/respond`,
        headers: bearer(driver.accessToken),
        payload: { accept: true },
      })
      const otp = (
        await app.inject({
          method: 'POST',
          url: `/v1/trips/${tripId}/handshake-otp`,
          headers: bearer(customer.accessToken),
        })
      ).json().otp as string

      await app.inject({
        method: 'POST',
        url: `/v1/trips/${tripId}/handshake`,
        headers: bearer(driver.accessToken),
        payload: { driver_selfie_base64: SELFIE, otp },
      })
      expect(await tripStatus(tripId)).toBe('IN_TRIP')

      // Admin suspends driver while IN_TRIP
      const suspendRes = await app.inject({
        method: 'POST',
        url: `/v1/admin/drivers/${driver.userId}/status`,
        headers: bearer(ops.accessToken),
        payload: { status: 'SUSPENDED', note: 'License verification flagged' },
      })
      expect(suspendRes.statusCode).toBe(200)

      // L2 escalation DRIVER_SUSPENDED_DURING_TRIP is opened on the active trip
      const { rows: esc } = await pool.query<{ level: string; reason: string; status: string }>(
        `SELECT level, reason, status FROM escalations WHERE trip_id = $1`,
        [tripId],
      )
      expect(esc).toContainEqual({
        level: 'L2',
        reason: 'DRIVER_SUSPENDED_DURING_TRIP',
        status: 'OPEN',
      })

      // Driver can still safely complete the ongoing trip
      const completeRes = await app.inject({
        method: 'POST',
        url: `/v1/trips/${tripId}/complete`,
        headers: bearer(driver.accessToken),
      })
      expect(completeRes.statusCode).toBe(200)
      expect(completeRes.json().status).toBe('COMPLETED')

      // Driver is forced OFFLINE (not restored to ONLINE) after completing the trip
      const { rows: prof } = await pool.query<{ availability: string }>(
        `SELECT availability FROM driver_profiles WHERE user_id = $1`,
        [driver.userId],
      )
      expect(prof[0]?.availability).toBe('OFFLINE')
      expect(await nearby()).not.toContain(driver.userId)
    })

    const suspend = (ops: { accessToken: string }, driverId: string) =>
      app.inject({
        method: 'POST',
        url: `/v1/admin/drivers/${driverId}/status`,
        headers: bearer(ops.accessToken),
        payload: { status: 'SUSPENDED' },
      })

    it('cancels an accepted trip not yet started, with no fee, and releases the hold', async () => {
      const customer = await makeCustomer(app, '+919700000016')
      const driver = await makeOnlineDriver(app, '+919700000017')
      const ops = await loginAsRole(app, '+919700000018', 'OPS_MANAGER')

      const tripId = (
        await app.inject({
          method: 'POST', url: '/v1/trips/book', headers: bearer(customer.accessToken), payload: BOOK_BODY,
        })
      ).json().id as string
      await awaitDispatchIdle()
      await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/offer/respond`,
        headers: bearer(driver.accessToken), payload: { accept: true },
      })
      // The driver is at the pickup: a customer cancelling now would pay the fee.
      await pool.query(`UPDATE trips SET arrived_at = now() WHERE id = $1`, [tripId])
      expect(await tripStatus(tripId)).toBe('HANDSHAKE_PENDING')

      expect((await suspend(ops, driver.userId)).statusCode).toBe(200)

      expect(await tripStatus(tripId)).toBe('CANCELLED')
      const { rows: trip } = await pool.query(
        `SELECT cancellation_fee, cancelled_by FROM trips WHERE id = $1`, [tripId],
      )
      expect(trip[0]?.cancellation_fee ?? null).toBeNull()
      expect(trip[0]?.cancelled_by).toBe(ops.userId)
      const { rows: pay } = await pool.query(`SELECT status FROM payments WHERE trip_id = $1`, [tripId])
      for (const p of pay) expect(p.status).toBe('RELEASED')
      const { rows: prof } = await pool.query(
        `SELECT availability FROM driver_profiles WHERE user_id = $1`, [driver.userId],
      )
      expect(prof[0]?.availability).toBe('OFFLINE')
    })

    it('sends an offered trip to the next driver instead of leaving it stuck', async () => {
      const customer = await makeCustomer(app, '+919700000019')
      const driver = await makeOnlineDriver(app, '+919700000020')
      const ops = await loginAsRole(app, '+919700000021', 'OPS_MANAGER')

      const tripId = (
        await app.inject({
          method: 'POST', url: '/v1/trips/book', headers: bearer(customer.accessToken), payload: BOOK_BODY,
        })
      ).json().id as string
      await awaitDispatchIdle()
      expect(await tripStatus(tripId)).toBe('MATCHED')
      // Online only now, so the first round went to `driver`.
      const second = await makeOnlineDriver(app, '+919700000022', GACHIBOWLI)

      expect((await suspend(ops, driver.userId)).statusCode).toBe(200)

      const { rows } = await pool.query(
        `SELECT driver_id, status FROM trip_offers WHERE trip_id = $1 ORDER BY round`, [tripId],
      )
      expect(rows).toEqual([
        { driver_id: driver.userId, status: 'EXPIRED' },
        { driver_id: second.userId, status: 'PENDING' },
      ])
      expect(await tripStatus(tripId)).toBe('MATCHED')
    })
  })
})
