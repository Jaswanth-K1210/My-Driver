import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/client.js'
import { seed } from '../../src/db/seed.js'
import { IntegrityEngine } from '../../src/modules/integrity/engine.js'
import { DEVIATION_GRACE_SECONDS } from '../../src/modules/integrity/evaluator.js'
import { ConsoleSmsProvider, setSmsProvider } from '../../src/providers/sms/index.js'
import { bearer } from '../helpers/auth.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'
import { liveEscalation, setLastFix } from '../helpers/safety.js'
import {
  BOOK_BODY, GACHIBOWLI, HITEC_CITY, makeCustomer, makeOnlineDriver, SELFIE, type Actor,
} from '../helpers/trips.js'
import { awaitDispatchIdle } from '../../src/modules/trips/dispatch-tracker.js'

describe('dual-GPS integrity engine', () => {
  let app: FastifyInstance
  let customer: Actor
  let driver: Actor
  let tripId: string
  let engine: IntegrityEngine
  let sms: ConsoleSmsProvider

  beforeAll(async () => { app = await buildApp(); await app.ready() })
  afterAll(async () => { setSmsProvider(undefined); await app.close() })

  beforeEach(async () => {
    await resetDb(); await resetRedis(); await seed()
    engine = new IntegrityEngine()

    customer = await makeCustomer(app, '+919876543210')
    driver = await makeOnlineDriver(app, '+919848012345')

    const booked = await app.inject({
      method: 'POST', url: '/v1/trips/book',
      headers: bearer(customer.accessToken), payload: BOOK_BODY,
    })
    tripId = booked.json().id as string
    await awaitDispatchIdle()

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

    sms = new ConsoleSmsProvider()
    setSmsProvider(sms)
  })

  it('raises nothing while the two devices are together', async () => {
    await setLastFix(tripId, 'driver', HITEC_CITY, 40)
    await setLastFix(tripId, 'customer', HITEC_CITY)

    expect(await engine.tick()).toBe(0)
    expect(await liveEscalation(tripId)).toBeNull()
  })

  it('does not fire immediately when the devices separate', async () => {
    await setLastFix(tripId, 'driver', HITEC_CITY, 40)
    await setLastFix(tripId, 'customer', GACHIBOWLI)

    // First pass only starts the 60-second clock.
    expect(await engine.tick()).toBe(0)
    expect(await liveEscalation(tripId)).toBeNull()
  })

  it('raises an L1 route deviation once separation outlasts the grace period', async () => {
    await setLastFix(tripId, 'driver', HITEC_CITY, 40)
    await setLastFix(tripId, 'customer', GACHIBOWLI)
    await engine.tick()

    // Rewind the engine's clock past the grace window.
    ;(engine as unknown as { state: Map<string, { separatedSince: number }> }).state.set(tripId, {
      separatedSince: Date.now() - (DEVIATION_GRACE_SECONDS + 5) * 1000,
    })
    expect(await engine.tick()).toBe(1)

    const escalation = await liveEscalation(tripId)
    expect(escalation).toMatchObject({ level: 'L1', reason: 'ROUTE_DEVIATION_EXCEEDED' })

    const { rows } = await pool.query(
      `SELECT reason, details FROM anomalies WHERE trip_id = $1`, [tripId],
    )
    expect(rows[0].reason).toBe('ROUTE_DEVIATION_EXCEEDED')
    expect(rows[0].details.deviation_distance_meters).toBeGreaterThan(150)
  })

  it('raises an L1 speed-ceiling breach from the driver stream alone', async () => {
    // BOOK_BODY sets a 60 km/h ceiling.
    await setLastFix(tripId, 'driver', HITEC_CITY, 88)
    await setLastFix(tripId, 'customer', HITEC_CITY)

    expect(await engine.tick()).toBe(1)
    expect(await liveEscalation(tripId)).toMatchObject({
      level: 'L1', reason: 'SPEED_CEILING_BREACH',
    })
  })

  it('notifies the customer guardians when an anomaly is raised', async () => {
    await app.inject({
      method: 'POST', url: '/v1/me/guardians', headers: bearer(customer.accessToken),
      payload: { name: 'Rajesh', relation: 'Father', phone: '+919848012399' },
    })
    sms.clear()

    await setLastFix(tripId, 'driver', HITEC_CITY, 95)
    await setLastFix(tripId, 'customer', HITEC_CITY)
    await engine.tick()

    expect(sms.sent).toHaveLength(1)
    expect(sms.sent[0]!.to).toBe('+919848012399')
    expect(sms.sent[0]!.body).toMatch(/speed ceiling breach/i)
  })

  it('collapses repeated detections into one incident, not a flood', async () => {
    await setLastFix(tripId, 'driver', HITEC_CITY, 88)
    await setLastFix(tripId, 'customer', HITEC_CITY)

    await engine.tick()
    await engine.tick()
    await engine.tick()

    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM escalations WHERE trip_id = $1`, [tripId])
    expect(rows[0].n).toBe(1)
  })

  it('deduplicates across instances — a second engine raises nothing', async () => {
    await setLastFix(tripId, 'driver', HITEC_CITY, 88)
    await setLastFix(tripId, 'customer', HITEC_CITY)

    const other = new IntegrityEngine()
    const [a, b] = await Promise.all([engine.tick(), other.tick()])

    // Exactly one of the two instances wins the Redis claim.
    expect(a + b).toBe(1)
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM anomalies WHERE trip_id = $1`, [tripId])
    expect(rows[0].n).toBe(1)
  })

  it('ignores trips that are not under way', async () => {
    await pool.query(`UPDATE trips SET status = 'COMPLETED' WHERE id = $1`, [tripId])
    await setLastFix(tripId, 'driver', HITEC_CITY, 120)
    await setLastFix(tripId, 'customer', GACHIBOWLI)

    expect(await engine.tick()).toBe(0)
  })

  it('forgets a trip once it ends, so its deviation clock cannot leak', async () => {
    await setLastFix(tripId, 'driver', HITEC_CITY, 40)
    await setLastFix(tripId, 'customer', GACHIBOWLI)
    await engine.tick()
    expect(engine.trackedTrips).toBe(1)

    await pool.query(`UPDATE trips SET status = 'COMPLETED' WHERE id = $1`, [tripId])
    await engine.tick()
    expect(engine.trackedTrips).toBe(0)
  })
})
