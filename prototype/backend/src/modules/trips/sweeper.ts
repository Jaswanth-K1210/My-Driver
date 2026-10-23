import { pool } from '../../db/client.js'
import { getPushProvider } from '../../providers/push/index.js'
import { setAvailability } from './geo-index.js'
import { recordMissedOffer } from './offer-hint.js'
import { expireUnpaidTrips } from '../payments/service.js'
import { broadcastStateChange } from './broadcast.js'
import { startDispatch } from './matching.js'
import { recordEvent, transitionTrip } from './service.js'

/**
 * SKIP LOCKED means every instance can run this loop concurrently without
 * contending for the same rows. Without it, N instances serialise.
 */
export async function expireStaleOffers(): Promise<number> {
  const client = await pool.connect()
  const expiredTripIds: string[] = []
  const missedBy: string[] = []
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{ id: string; trip_id: string; driver_id: string }>(
      `SELECT id, trip_id, driver_id FROM trip_offers
        WHERE status = 'PENDING' AND expires_at <= now()
        ORDER BY expires_at
        LIMIT 200
        FOR UPDATE SKIP LOCKED`,
    )

    for (const offer of rows) {
      await client.query(
        `UPDATE trip_offers SET status = 'EXPIRED', responded_at = now() WHERE id = $1`,
        [offer.id],
      )
      missedBy.push(offer.driver_id)
      const { rows: tripRows } = await client.query<{ status: string }>(
        `SELECT status FROM trips WHERE id = $1 FOR UPDATE`,
        [offer.trip_id],
      )
      if (tripRows[0]?.status === 'MATCHED') {
        await transitionTrip(client, offer.trip_id, 'MATCHED', 'REQUESTED')
        await recordEvent(client, offer.trip_id, 'OFFER_EXPIRED', null, null, {})
        expiredTripIds.push(offer.trip_id)
      }
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  for (const driverId of missedBy) {
    if (!(await recordMissedOffer(driverId).catch(() => false))) continue
    await setAvailability(driverId, 'OFFLINE').catch(() => undefined)
    await getPushProvider()
      .send(driverId, {
        title: "You're offline",
        body: 'You missed two trip requests in a row, so we set you offline. Go online again when you are ready.',
        data: { type: 'AUTO_OFFLINE' },
        channel: 'offers',
      })
      .catch(() => undefined)
  }

  for (const tripId of expiredTripIds) {
    await broadcastStateChange(tripId, 'REQUESTED').catch(() => undefined)
    await startDispatch(tripId).catch(() => undefined)
  }
  return expiredTripIds.length
}

export function startSweeper(intervalMs = 5_000): () => void {
  const timer = setInterval(() => {
    void expireStaleOffers().catch((err) => console.error('sweeper failed', err))
    void expireUnpaidTrips().catch((err) => console.error('unpaid sweep failed', err))
  }, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}
