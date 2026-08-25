import { pool } from '../../db/client.js'
import { conflict, notFound } from '../../lib/errors.js'
import { getPushProvider } from '../../providers/push/index.js'
import { broadcastOffer, broadcastStateChange } from './broadcast.js'
import { findNearbyDrivers, SEARCH_RADIUS_KM, setAvailability } from './geo-index.js'
import {
  getTripById,
  getTripForParticipant,
  recordEvent,
  transitionTrip,
  type TripView,
} from './service.js'
import type { TripStatus } from './state-machine.js'

export const OFFER_TTL_SECONDS = 20
export const MAX_DISPATCH_ROUNDS = 3

type DispatchTrip = {
  id: string
  customer_id: string
  status: TripStatus
  pickup_lat: number
  pickup_lng: number
  required_certification: string
  dispatch_round: number
  estimated_fare: number | null
}

async function loadTrip(id: string): Promise<DispatchTrip> {
  const { rows } = await pool.query<DispatchTrip>(
    `SELECT id, customer_id, status, pickup_lat, pickup_lng,
            required_certification, dispatch_round,
            estimated_fare::float8 AS estimated_fare
       FROM trips WHERE id = $1`,
    [id],
  )
  if (!rows[0]) throw notFound('TRIP_NOT_FOUND', 'No such trip')
  return rows[0]
}

async function endWithNoDrivers(trip: DispatchTrip): Promise<void> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await transitionTrip(client, trip.id, trip.status, 'NO_DRIVERS_FOUND')
    await recordEvent(client, trip.id, 'TRIP_NO_DRIVERS_FOUND', null, null, {
      rounds_attempted: trip.dispatch_round,
    })
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  await broadcastStateChange(trip.id, 'NO_DRIVERS_FOUND')
}

/**
 * Offer the trip to the best remaining candidate. Drivers already offered this
 * trip in an earlier round are excluded so a decline is not re-sent.
 */
export async function startDispatch(tripId: string): Promise<void> {
  const trip = await loadTrip(tripId)
  if (trip.status !== 'REQUESTED') return

  if (trip.dispatch_round >= MAX_DISPATCH_ROUNDS) return endWithNoDrivers(trip)

  const candidates = await findNearbyDrivers(
    { lat: trip.pickup_lat, lng: trip.pickup_lng },
    SEARCH_RADIUS_KM,
    trip.required_certification,
    10,
  )

  const { rows: alreadyOffered } = await pool.query<{ driver_id: string }>(
    `SELECT driver_id FROM trip_offers WHERE trip_id = $1`,
    [tripId],
  )
  const seen = new Set(alreadyOffered.map((r) => r.driver_id))
  const driverId = candidates.find((id) => !seen.has(id))

  if (!driverId) return endWithNoDrivers(trip)

  const round = trip.dispatch_round + 1
  const client = await pool.connect()
  let expiresAt: Date
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{ expires_at: Date }>(
      `INSERT INTO trip_offers (trip_id, driver_id, round, expires_at)
       VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval)
       RETURNING expires_at`,
      [tripId, driverId, round, String(OFFER_TTL_SECONDS)],
    )
    expiresAt = rows[0]!.expires_at
    await transitionTrip(client, tripId, 'REQUESTED', 'MATCHED', { dispatch_round: round })
    await recordEvent(client, tripId, 'TRIP_MATCHED', null, null, { driver_id: driverId, round })
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  // Announced only after the transaction commits — publishing inside it would
  // announce a state that may still roll back.
  await broadcastStateChange(tripId, 'MATCHED')
  await broadcastOffer(
    tripId,
    expiresAt,
    { lat: trip.pickup_lat, lng: trip.pickup_lng },
    trip.estimated_fare,
  )

  // Best-effort notification. A failure here must not roll back the offer;
  // the driver app also receives the offer over its WebSocket.
  await getPushProvider()
    .send(driverId, {
      title: 'New trip request',
      body: 'A customer nearby is requesting a driver',
      data: { trip_id: tripId, expires_in: String(OFFER_TTL_SECONDS) },
    })
    .catch(() => undefined)
}

export async function respondToOffer(
  tripId: string,
  driverId: string,
  accept: boolean,
): Promise<TripView> {
  const client = await pool.connect()
  let redispatch = false
  try {
    await client.query('BEGIN')

    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM trip_offers
        WHERE trip_id = $1 AND driver_id = $2 AND status = 'PENDING' AND expires_at > now()
        FOR UPDATE`,
      [tripId, driverId],
    )
    if (!rows[0]) {
      throw notFound('OFFER_NOT_FOUND', 'No live offer for this driver on this trip')
    }

    await client.query(`UPDATE trip_offers SET status = $2, responded_at = now() WHERE id = $1`, [
      rows[0].id,
      accept ? 'ACCEPTED' : 'DECLINED',
    ])

    if (accept) {
      await transitionTrip(client, tripId, 'MATCHED', 'HANDSHAKE_PENDING', {
        driver_id: driverId,
        matched_at: new Date(),
      })
      await recordEvent(client, tripId, 'OFFER_ACCEPTED', driverId, 'DRIVER', {})
    } else {
      await transitionTrip(client, tripId, 'MATCHED', 'REQUESTED')
      await recordEvent(client, tripId, 'OFFER_DECLINED', driverId, 'DRIVER', {})
      redispatch = true
    }

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    if ((err as { code?: string }).code === '23505') {
      throw conflict('OFFER_ALREADY_TAKEN', 'This trip has already been accepted')
    }
    throw err
  } finally {
    client.release()
  }

  if (accept) {
    await setAvailability(driverId, 'ON_TRIP')
    await broadcastStateChange(tripId, 'HANDSHAKE_PENDING')
    return getTripForParticipant(tripId, driverId)
  }

  await broadcastStateChange(tripId, 'REQUESTED')
  // Re-dispatch before reading the trip back, so the response reflects the
  // round that was just started rather than the momentary REQUESTED gap.
  if (redispatch) await startDispatch(tripId)

  // A decliner is not a participant (driver_id is only set on accept), so the
  // participant-scoped read would 404. They were legitimately shown this trip.
  return getTripById(tripId)
}
