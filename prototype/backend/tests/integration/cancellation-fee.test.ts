import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/client.js'
import { seed } from '../../src/db/seed.js'
import { awaitDispatchIdle } from '../../src/modules/trips/dispatch-tracker.js'
import { bearer } from '../helpers/auth.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'
import { loginAsRole } from '../helpers/safety.js'
import { BOOK_BODY, makeCustomer, makeOnlineDriver, type Actor } from '../helpers/trips.js'

describe('cancelling after the driver has arrived', () => {
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

  /** Booked and accepted: the trip is HANDSHAKE_PENDING, driver on the way. */
  async function accepted(): Promise<string> {
    const tripId = (await app.inject({
      method: 'POST', url: '/v1/trips/book', headers: bearer(customer.accessToken), payload: BOOK_BODY,
    })).json().id as string
    await awaitDispatchIdle()
    await app.inject({
      method: 'POST', url: `/v1/trips/${tripId}/offer/respond`, headers: bearer(driver.accessToken), payload: { accept: true },
    })
    return tripId
  }
  const arrive = (tripId: string) => pool.query(`UPDATE trips SET arrived_at = now() WHERE id = $1`, [tripId])
  const cancel = (tripId: string, actor: Actor) =>
    app.inject({
      method: 'POST', url: `/v1/trips/${tripId}/cancel`, headers: bearer(actor.accessToken), payload: { reason: 'test' },
    })
  const earnings = async () =>
    (await app.inject({ method: 'GET', url: '/v1/driver/earnings', headers: bearer(driver.accessToken) })).json()

  it('charges the customer the fee and pays it to the driver in full', async () => {
    const tripId = await accepted()
    await arrive(tripId)
    const res = await cancel(tripId, customer)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: 'CANCELLED', cancellation_fee: 100, fare_amount: 100, driver_earnings: 100 })

    const e = await earnings()
    expect(e.today?.earnings ?? e.today).toBe(100)
    expect(e.trips.find((t: { trip_id: string }) => t.trip_id === tripId)).toMatchObject({ cancellation_fee: 100 })
  })

  it('is free before the driver arrives', async () => {
    const tripId = await accepted()
    const res = await cancel(tripId, customer)
    expect(res.json().cancellation_fee ?? null).toBeNull()
    expect(res.json().fare_amount).toBeNull()
  })

  it('never charges the customer when the driver cancels', async () => {
    const tripId = await accepted()
    await arrive(tripId)
    const res = await cancel(tripId, driver)
    expect(res.statusCode).toBe(200)
    expect(res.json().cancellation_fee ?? null).toBeNull()
  })

  it('uses the fee Finance set in the console', async () => {
    const finance = await loginAsRole(app, '+919000000001', 'FINANCE')
    await app.inject({
      method: 'PATCH', url: '/v1/admin/pricing/fees', headers: bearer(finance.accessToken),
      payload: { arrival_cancellation_fee: 150 },
    })
    const tripId = await accepted()
    await arrive(tripId)
    expect((await cancel(tripId, customer)).json().cancellation_fee).toBe(150)
  })
})
