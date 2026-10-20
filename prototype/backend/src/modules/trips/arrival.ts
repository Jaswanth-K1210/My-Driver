import { pool } from '../../db/client.js'
import { haversineMeters } from '../../lib/geo.js'
import { getHub } from '../../realtime/hub.js'
import { redis } from '../../redis/client.js'
import { notifyCustomer } from './customer-push.js'
import { recordEvent } from './service.js'

/** Close enough to the pickup to tell the customer to come out. */
export const ARRIVAL_RADIUS_M = 150

/**
 * "Driver arrived" without a button in the driver app: telemetry already
 * streams from HANDSHAKE_PENDING, so the first fix inside the radius marks
 * the arrival. Runs on the integrity engine's pass and reads the same
 * last-known position, so it adds nothing to the ingest path.
 */
export async function detectArrivals(): Promise<number> {
  const { rows } = await pool.query<{ id: string; lat: number; lng: number }>(
    `SELECT id, pickup_lat::float8 AS lat, pickup_lng::float8 AS lng
       FROM trips WHERE status = 'HANDSHAKE_PENDING' AND arrived_at IS NULL`,
  )
  let arrived = 0
  for (const trip of rows) {
    const raw = await redis.get(`trip:{${trip.id}}:last:driver`)
    if (!raw) continue
    const fix = JSON.parse(raw) as { lat: number; lng: number }
    if (haversineMeters(fix, trip) > ARRIVAL_RADIUS_M) continue
    if (await markArrived(trip.id)) arrived++
  }
  return arrived
}

/**
 * Set once. The WHERE clause is the guard: every instance's engine may see
 * the same fix, and only one of them updates the row and notifies.
 */
export async function markArrived(tripId: string): Promise<boolean> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{ driver_id: string }>(
      `UPDATE trips SET arrived_at = now()
        WHERE id = $1 AND status = 'HANDSHAKE_PENDING' AND arrived_at IS NULL
        RETURNING driver_id`,
      [tripId],
    )
    if (!rows[0]) {
      await client.query('ROLLBACK')
      return false
    }
    await recordEvent(client, tripId, 'DRIVER_ARRIVED', null, null)
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  await getHub().publish(tripId, { type: 'DRIVER_ARRIVED', trip_id: tripId })
  await notifyCustomer(tripId, 'DRIVER_ARRIVED')
  return true
}
