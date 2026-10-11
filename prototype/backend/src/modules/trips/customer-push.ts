import { pool } from '../../db/client.js'
import { getPushProvider, type PushPayload } from '../../providers/push/index.js'
import type { TripStatus } from './state-machine.js'

/** Android channel the customer app creates for these (src/lib/push.js). */
const CHANNEL = 'trips'

type Row = { customer_id: string; cancelled_by: string | null; amount_due: number }

function messageFor(status: TripStatus, row: Row): Omit<PushPayload, 'data' | 'channel'> & { type: string } | null {
  switch (status) {
    case 'HANDSHAKE_PENDING':
      return {
        type: 'DRIVER_MATCHED',
        title: 'Your driver is on the way',
        body: 'A driver has accepted your trip. Open MyDriver to see them and your pickup code.',
      }
    case 'IN_TRIP':
      return { type: 'TRIP_STARTED', title: 'Trip started', body: 'Your trip is under way. Follow it live in MyDriver.' }
    case 'COMPLETED':
      return row.amount_due > 0
        ? {
            type: 'PAYMENT_DUE',
            title: 'Trip ended · payment due',
            body: `Your trip has ended. ₹${row.amount_due.toFixed(2)} is still to pay, because the final fare was more than the amount held.`,
          }
        : { type: 'TRIP_ENDED', title: 'Trip ended', body: 'Your trip has ended. Rate your driver in MyDriver.' }
    case 'NO_DRIVERS_FOUND':
      return {
        type: 'NO_DRIVERS_FOUND',
        title: 'No driver available',
        body: 'We could not find a driver for your trip. The amount held has been released.',
      }
    case 'CANCELLED':
      // The customer already knows about a cancellation they made themselves.
      return row.cancelled_by === row.customer_id
        ? null
        : { type: 'TRIP_CANCELLED', title: 'Trip cancelled', body: 'Your trip was cancelled. The amount held has been released.' }
    default:
      // REQUESTED and MATCHED are dispatch detail; ESCALATED is announced by
      // the escalation module.
      return null
  }
}

/**
 * Tells the customer's phone about a trip event, for when the app is closed
 * and its WebSocket is not connected. Best effort: a push that fails must
 * never fail the transition that caused it.
 */
export async function notifyCustomer(tripId: string, status: TripStatus): Promise<void> {
  if (!['HANDSHAKE_PENDING', 'IN_TRIP', 'COMPLETED', 'NO_DRIVERS_FOUND', 'CANCELLED'].includes(status)) return
  try {
    const { rows } = await pool.query<Row>(
      `SELECT t.customer_id, t.cancelled_by, COALESCE(p.amount_due, 0)::float8 AS amount_due
         FROM trips t LEFT JOIN payments p ON p.trip_id = t.id
        WHERE t.id = $1`,
      [tripId],
    )
    const row = rows[0]
    if (!row) return
    const message = messageFor(status, row)
    if (!message) return
    const { type, ...content } = message
    await getPushProvider().send(row.customer_id, {
      ...content,
      data: { type, trip_id: tripId, status },
      channel: CHANNEL,
    })
  } catch (err) {
    console.error('customer push failed', tripId, status, err)
  }
}
