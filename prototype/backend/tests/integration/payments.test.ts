import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/client.js'
import { seed } from '../../src/db/seed.js'
import { awaitDispatchIdle } from '../../src/modules/trips/dispatch-tracker.js'
import { hmacHex, MOCK_SECRET, MockPaymentProvider, setPaymentProvider } from '../../src/providers/payments/index.js'
import { bearer } from '../helpers/auth.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'
import { loginAsRole } from '../helpers/safety.js'
import { BOOK_BODY, makeCustomer, makeOnlineDriver, SELFIE, tripStatus, type Actor } from '../helpers/trips.js'

describe('payments: authorize at booking, capture at completion', () => {
  let app: FastifyInstance
  let customer: Actor
  let driver: Actor
  let mock: MockPaymentProvider

  beforeAll(async () => { app = await buildApp(); await app.ready() })
  beforeEach(async () => {
    await resetDb(); await resetRedis(); await seed()
    mock = new MockPaymentProvider()
    setPaymentProvider(mock)
    customer = await makeCustomer(app, '+919876500001')
    driver = await makeOnlineDriver(app, '+919876500002')
  })
  afterEach(() => setPaymentProvider(undefined))
  afterAll(async () => { await app.close() })

  const book = async () => {
    const res = await app.inject({ method: 'POST', url: '/v1/trips/book', headers: bearer(customer.accessToken), payload: BOOK_BODY })
    expect(res.statusCode).toBe(201)
    return res.json() as { id: string; payment: { id: string; provider_order_id: string; status: string; amount_authorized: number } }
  }
  const approve = (paymentId: string) =>
    app.inject({ method: 'POST', url: `/v1/payments/${paymentId}/mock/approve` })
  const paymentRow = async (tripId: string) =>
    (await pool.query(`SELECT * FROM payments WHERE trip_id = $1`, [tripId])).rows[0]

  it('creates a hold at booking and does not dispatch until it is authorized', async () => {
    const trip = await book()
    expect(trip.payment.status).toBe('CREATED')
    await awaitDispatchIdle()
    expect(await tripStatus(trip.id)).toBe('REQUESTED')

    const res = await approve(trip.payment.id)
    expect(res.statusCode).toBe(200)
    await awaitDispatchIdle()
    expect(await tripStatus(trip.id)).toBe('MATCHED')
    expect((await paymentRow(trip.id)).status).toBe('AUTHORIZED')
  })

  it('rejects a forged checkout signature', async () => {
    const trip = await book()
    const res = await app.inject({
      method: 'POST', url: '/v1/payments/verify',
      payload: { order_id: trip.payment.provider_order_id, payment_id: 'pay_x', signature: 'deadbeef' },
    })
    expect(res.statusCode).toBe(401)
    expect((await paymentRow(trip.id)).status).toBe('CREATED')
  })

  it('captures the final fare when the trip completes', async () => {
    const trip = await book()
    await approve(trip.payment.id)
    await awaitDispatchIdle()
    await app.inject({ method: 'POST', url: `/v1/trips/${trip.id}/offer/respond`, headers: bearer(driver.accessToken), payload: { accept: true } })
    const otp = await app.inject({ method: 'POST', url: `/v1/trips/${trip.id}/handshake-otp`, headers: bearer(customer.accessToken) })
    await app.inject({ method: 'POST', url: `/v1/trips/${trip.id}/handshake`, headers: bearer(driver.accessToken), payload: { driver_selfie_base64: SELFIE, otp: otp.json().otp } })
    const done = await app.inject({ method: 'POST', url: `/v1/trips/${trip.id}/complete`, headers: bearer(driver.accessToken) })
    expect(done.statusCode).toBe(200)

    const p = await paymentRow(trip.id)
    expect(p.status).toBe('CAPTURED')
    expect(Number(p.amount_captured)).toBeGreaterThan(0)
    expect(Number(p.amount_captured)).toBeLessThanOrEqual(Number(p.amount_authorized))
    expect(mock.captured).toHaveLength(1)
  })

  it('releases the hold when the customer cancels', async () => {
    const trip = await book()
    await approve(trip.payment.id)
    await awaitDispatchIdle()
    await app.inject({ method: 'POST', url: `/v1/trips/${trip.id}/cancel`, headers: bearer(customer.accessToken), payload: { reason: 'Plans changed' } })
    expect((await paymentRow(trip.id)).status).toBe('RELEASED')
  })

  it('treats a redelivered webhook as a no-op', async () => {
    const trip = await book()
    const body = JSON.stringify({
      event: 'payment.authorized',
      payload: { payment: { entity: { id: 'pay_wh_1', order_id: trip.payment.provider_order_id } } },
    })
    const send = () => app.inject({
      method: 'POST', url: '/v1/payments/webhook', payload: body,
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': hmacHex(MOCK_SECRET, body), 'x-razorpay-event-id': 'evt_1' },
    })
    expect((await send()).json()).toMatchObject({ duplicate: false })
    expect((await send()).json()).toMatchObject({ duplicate: true })
    expect((await paymentRow(trip.id)).status).toBe('AUTHORIZED')
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM payment_events`)
    expect(rows[0].n).toBe(1)
  })

  it('rejects a webhook with a bad signature', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/payments/webhook', payload: '{"event":"payment.authorized"}',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'nope' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('lets Finance refund a captured payment, but not Ops, and never beyond the capture', async () => {
    const trip = await book()
    await pool.query(
      `UPDATE payments SET status = 'CAPTURED', provider_payment_id = 'pay_r', amount_authorized = 500, amount_captured = 500 WHERE trip_id = $1`,
      [trip.id],
    )
    const p = await paymentRow(trip.id)
    const ops = await loginAsRole(app, '+919876500003', 'OPS_MANAGER')
    const fin = await loginAsRole(app, '+919876500004', 'FINANCE')
    const refund = (token: string, amount?: number) => app.inject({
      method: 'POST', url: `/v1/admin/payments/${p.id}/refund`, headers: bearer(token),
      payload: { reason: 'Driver arrived late', ...(amount ? { amount } : {}) },
    })

    expect((await refund(ops.accessToken)).statusCode).toBe(403)
    expect((await refund(fin.accessToken, 600)).statusCode).toBe(400)
    const partial = await refund(fin.accessToken, 200)
    expect(partial.statusCode).toBe(200)
    expect(partial.json()).toMatchObject({ status: 'CAPTURED', amount_refunded: 200 })
    const rest = await refund(fin.accessToken)
    expect(rest.json()).toMatchObject({ status: 'REFUNDED', amount_refunded: 500 })
  })

  it('books without a payment step when payments are switched off', async () => {
    setPaymentProvider(null)
    const trip = await book()
    expect(trip.payment).toBeNull()
    await awaitDispatchIdle()
    expect(await tripStatus(trip.id)).toBe('MATCHED')
  })
})
