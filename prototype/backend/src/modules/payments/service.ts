import { env } from '../../config/env.js'
import { pool } from '../../db/client.js'
import { hideDemo } from '../../lib/demo.js'
import { badRequest, conflict, notFound, unauthorized } from '../../lib/errors.js'
import { getPaymentProvider, type PaymentProvider } from '../../providers/payments/index.js'
import type { Role } from '../auth/otp.js'
import { audit } from '../safety-desk/service.js'

export type PaymentStatus = 'CREATED' | 'AUTHORIZED' | 'CAPTURED' | 'RELEASED' | 'REFUNDED' | 'FAILED'

export type PaymentView = {
  id: string
  trip_id: string
  provider: string
  provider_order_id: string
  provider_payment_id: string | null
  status: PaymentStatus
  amount_authorized: number
  amount_captured: number
  amount_refunded: number
  amount_due: number
  failure_reason: string | null
  checkout_url: string
  created_at: string
}

const SELECT = `
  SELECT id, trip_id, provider, provider_order_id, provider_payment_id, status,
         amount_authorized::float8 AS amount_authorized,
         amount_captured::float8   AS amount_captured,
         amount_refunded::float8   AS amount_refunded,
         amount_due::float8        AS amount_due,
         failure_reason, created_at, customer_id
    FROM payments`

const toPaise = (rupees: number): number => Math.round(rupees * 100)

function view(row: Record<string, any>): PaymentView {
  const { customer_id: _c, ...rest } = row
  return {
    ...(rest as Omit<PaymentView, 'checkout_url'>),
    checkout_url: `${env.PUBLIC_API_URL}/v1/payments/${row.id}/checkout`,
  }
}

function requireProvider(): PaymentProvider {
  const p = getPaymentProvider()
  if (!p) throw conflict('PAYMENTS_DISABLED', 'Payments are not enabled on this server')
  return p
}

export const paymentsEnabled = (): boolean => getPaymentProvider() !== null

/**
 * Called right after a booking commits. Idempotent per trip: a booking retried
 * with the same idempotency key gets the same order, never a second hold.
 */
export async function createPaymentForTrip(tripId: string, customerId: string, amount: number): Promise<PaymentView> {
  const existing = await pool.query(`${SELECT} WHERE trip_id = $1`, [tripId])
  if (existing.rows[0]) return view(existing.rows[0])

  const provider = requireProvider()
  const { orderId } = await provider.createOrder(toPaise(amount), tripId)
  await pool.query(
    `INSERT INTO payments (trip_id, customer_id, provider, provider_order_id, amount_authorized)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (trip_id) DO NOTHING`,
    [tripId, customerId, provider.name, orderId, amount.toFixed(2)],
  )
  // Re-read by trip: if a concurrent retry won the insert, theirs is the payment of record.
  const { rows: final } = await pool.query(`${SELECT} WHERE trip_id = $1`, [tripId])
  return view(final[0]!)
}

export async function getPayment(paymentId: string): Promise<PaymentView & { customer_id: string }> {
  const { rows } = await pool.query(`${SELECT} WHERE id = $1`, [paymentId])
  if (!rows[0]) throw notFound('PAYMENT_NOT_FOUND', 'No such payment')
  return { ...view(rows[0]), customer_id: rows[0].customer_id }
}

export async function getPaymentForTrip(tripId: string, userId: string): Promise<PaymentView | null> {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM trips WHERE id = $1 AND (customer_id = $2 OR driver_id = $2)`,
    [tripId, userId],
  )
  if (!rowCount) throw notFound('TRIP_NOT_FOUND', 'No such trip')
  const { rows } = await pool.query(`${SELECT} WHERE trip_id = $1`, [tripId])
  return rows[0] ? view(rows[0]) : null
}

/**
 * The authorization step. Reached from the checkout callback (signature from
 * the browser) or the webhook (signature on the body). Either way exactly one
 * caller flips CREATED -> AUTHORIZED, and only that caller starts dispatch.
 */
export async function markAuthorized(orderId: string, paymentId: string): Promise<{ tripId: string; changed: boolean }> {
  const { rows } = await pool.query<{ trip_id: string }>(
    `UPDATE payments
        SET status = 'AUTHORIZED', provider_payment_id = $2, failure_reason = NULL, updated_at = now()
      WHERE provider_order_id = $1 AND status IN ('CREATED', 'FAILED')
      RETURNING trip_id`,
    [orderId, paymentId],
  )
  if (rows[0]) {
    await dispatchPaidTrip(rows[0].trip_id)
    return { tripId: rows[0].trip_id, changed: true }
  }
  const { rows: found } = await pool.query<{ trip_id: string }>(
    `SELECT trip_id FROM payments WHERE provider_order_id = $1`,
    [orderId],
  )
  if (!found[0]) throw notFound('PAYMENT_NOT_FOUND', 'No payment for that order')
  return { tripId: found[0].trip_id, changed: false }
}

async function dispatchPaidTrip(tripId: string): Promise<void> {
  const [{ startDispatch }, { trackDispatch }] = await Promise.all([
    import('../trips/matching.js'),
    import('../trips/dispatch-tracker.js'),
  ])
  const { rows } = await pool.query<{ status: string }>(`SELECT status FROM trips WHERE id = $1`, [tripId])
  if (rows[0]?.status === 'REQUESTED') {
    trackDispatch(startDispatch(tripId).catch((err) => console.error('dispatch after payment failed', err)))
  }
}

export async function verifyCheckout(orderId: string, paymentId: string, signature: string) {
  const provider = requireProvider()
  if (!provider.verifyCheckoutSignature(orderId, paymentId, signature)) {
    throw unauthorized('BAD_SIGNATURE', 'Payment signature did not verify')
  }
  const { tripId } = await markAuthorized(orderId, paymentId)
  return { trip_id: tripId, status: 'AUTHORIZED' as const }
}

export async function markFailed(orderId: string, reason: string): Promise<void> {
  await pool.query(
    `UPDATE payments SET status = 'FAILED', failure_reason = $2, updated_at = now()
      WHERE provider_order_id = $1 AND status = 'CREATED'`,
    [orderId, reason],
  )
}

/**
 * Trip completed: take the final fare out of the hold. The provider call is
 * made before the row changes, so a failed capture leaves the payment
 * AUTHORIZED for the next attempt rather than claiming money we do not have.
 */
export async function captureForTrip(tripId: string, finalFare: number): Promise<void> {
  const provider = getPaymentProvider()
  if (!provider) return
  const { rows } = await pool.query<{ id: string; provider_payment_id: string; amount_authorized: string }>(
    `SELECT id, provider_payment_id, amount_authorized FROM payments
      WHERE trip_id = $1 AND status = 'AUTHORIZED'`,
    [tripId],
  )
  const p = rows[0]
  if (!p) return

  const authorized = Number(p.amount_authorized)
  // ponytail: overage beyond the hold is recorded as amount_due, not charged.
  // A second order for the difference is the upgrade if overtime is common.
  const capture = Math.min(finalFare, authorized)
  await provider.capture(p.provider_payment_id, toPaise(capture))
  await pool.query(
    `UPDATE payments
        SET status = 'CAPTURED', amount_captured = $2, amount_due = $3, updated_at = now()
      WHERE id = $1 AND status = 'AUTHORIZED'`,
    [p.id, capture.toFixed(2), Math.max(0, finalFare - capture).toFixed(2)],
  )
}

/** Trip cancelled or nobody accepted: let the hold go. */
export async function releaseForTrip(tripId: string): Promise<void> {
  await pool.query(
    `UPDATE payments SET status = 'RELEASED', updated_at = now()
      WHERE trip_id = $1 AND status IN ('CREATED', 'AUTHORIZED', 'FAILED')`,
    [tripId],
  )
}

export async function refundPayment(
  paymentId: string,
  amount: number | undefined,
  reason: string,
  actorId: string,
  actorRole: Role,
): Promise<PaymentView> {
  const provider = requireProvider()
  const { rows } = await pool.query<{
    provider_payment_id: string
    status: PaymentStatus
    amount_captured: string
    amount_refunded: string
    trip_id: string
  }>(
    `SELECT provider_payment_id, status, amount_captured, amount_refunded, trip_id
       FROM payments WHERE id = $1`,
    [paymentId],
  )
  const p = rows[0]
  if (!p) throw notFound('PAYMENT_NOT_FOUND', 'No such payment')
  if (p.status !== 'CAPTURED') throw conflict('NOT_REFUNDABLE', `A ${p.status} payment cannot be refunded`)

  const refundable = Number(p.amount_captured) - Number(p.amount_refunded)
  const value = amount ?? refundable
  if (value <= 0 || value > refundable + 1e-9) {
    throw badRequest('INVALID_REFUND_AMOUNT', `Refund must be between ₹0.01 and ₹${refundable.toFixed(2)}`)
  }

  const { refundId } = await provider.refund(p.provider_payment_id, toPaise(value))
  // The amount guard in WHERE makes two concurrent refunds unable to exceed
  // the captured total between them, on top of the table CHECK.
  const { rowCount } = await pool.query(
    `UPDATE payments
        SET amount_refunded = amount_refunded + $2,
            status = CASE WHEN amount_refunded + $2 >= amount_captured THEN 'REFUNDED'::payment_status ELSE status END,
            updated_at = now()
      WHERE id = $1 AND amount_refunded + $2 <= amount_captured`,
    [paymentId, value.toFixed(2)],
  )
  if (rowCount === 0) throw conflict('REFUND_RACE', 'Another refund was issued at the same time; reload and retry')

  await audit(actorId, actorRole, 'PAYMENT_REFUND', p.trip_id, {
    payment_id: paymentId,
    amount: value,
    reason,
    refund_id: refundId,
  })
  return getPayment(paymentId)
}

export async function listPayments(status: PaymentStatus | undefined, limit: number) {
  const { rows } = await pool.query(
    `SELECT p.id, p.trip_id, p.provider, p.provider_order_id, p.provider_payment_id, p.status,
            p.amount_authorized::float8 AS amount_authorized,
            p.amount_captured::float8   AS amount_captured,
            p.amount_refunded::float8   AS amount_refunded,
            p.amount_due::float8        AS amount_due,
            p.failure_reason, p.created_at, p.updated_at,
            u.full_name AS customer_name, u.phone_number AS customer_phone,
            t.status AS trip_status
       FROM payments p
       JOIN users u ON u.id = p.customer_id
       JOIN trips t ON t.id = p.trip_id
      WHERE ($1::payment_status IS NULL OR p.status = $1)
        ${hideDemo('u.is_demo')}
      ORDER BY p.created_at DESC
      LIMIT $2`,
    [status ?? null, limit],
  )
  const { rows: totals } = await pool.query(
    `SELECT COALESCE(sum(amount_captured), 0)::float8 AS captured,
            COALESCE(sum(amount_refunded), 0)::float8 AS refunded,
            COALESCE(sum(amount_authorized) FILTER (WHERE status = 'AUTHORIZED'), 0)::float8 AS held,
            COALESCE(sum(amount_due), 0)::float8 AS due
       FROM payments p
      WHERE true ${hideDemo('(SELECT is_demo FROM users WHERE id = p.customer_id)')}`,
  )
  return { items: rows, totals: totals[0] }
}

/**
 * Webhook entry point, after the signature check. The INSERT on the event id
 * is the idempotency guard: a redelivered event inserts nothing and stops.
 */
export async function handleWebhookEvent(eventId: string, event: Record<string, any>): Promise<{ duplicate: boolean }> {
  const entity = event.payload?.payment?.entity ?? {}
  const orderId: string | undefined = entity.order_id
  const { rows: pay } = orderId
    ? await pool.query<{ id: string }>(`SELECT id FROM payments WHERE provider_order_id = $1`, [orderId])
    : { rows: [] as { id: string }[] }

  const { rowCount } = await pool.query(
    `INSERT INTO payment_events (payment_id, provider_event_id, type, payload)
     VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (provider_event_id) DO NOTHING`,
    [pay[0]?.id ?? null, eventId, String(event.event ?? 'unknown'), JSON.stringify(event)],
  )
  if (rowCount === 0) return { duplicate: true }
  if (!orderId || !pay[0]) return { duplicate: false }

  switch (event.event) {
    case 'payment.authorized':
      await markAuthorized(orderId, entity.id)
      break
    case 'payment.failed':
      await markFailed(orderId, entity.error_description ?? 'Payment failed')
      break
  }
  return { duplicate: false }
}

/**
 * Trips whose checkout was abandoned would sit in REQUESTED forever, holding
 * nothing but cluttering the board. Cancel them after 15 minutes.
 */
export async function expireUnpaidTrips(): Promise<number> {
  if (!paymentsEnabled()) return 0
  const { rows } = await pool.query<{ trip_id: string }>(
    `SELECT p.trip_id FROM payments p JOIN trips t ON t.id = p.trip_id
      WHERE p.status IN ('CREATED', 'FAILED') AND t.status = 'REQUESTED'
        AND p.created_at < now() - INTERVAL '15 minutes'
      LIMIT 100`,
  )
  const { cancelUnpaidTrip } = await import('../trips/service.js')
  for (const r of rows) await cancelUnpaidTrip(r.trip_id).catch(() => undefined)
  return rows.length
}
