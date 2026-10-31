import { pool } from '../../db/client.js'
import { isNightPickupIST } from '../../lib/time.js'
import { conflict, notFound } from '../../lib/errors.js'
import { getPushProvider } from '../../providers/push/index.js'
import type { Role } from '../auth/otp.js'
import { revokeLinksForEndedTrip } from '../guardian/service.js'
import { releaseForTrip } from '../payments/service.js'
import { broadcastOffer, broadcastStateChange } from './broadcast.js'
import { findNearbyDrivers, requireApprovedDriver, SEARCH_RADIUS_KM, setAvailability } from './geo-index.js'
import { clearMissedOffers, flagPendingOffer } from './offer-hint.js'
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
/**
 * After the first rounds find nobody, keep looking this long from booking
 * (the customer is told "within 30 minutes") before giving up.
 */
export const EXTENDED_SEARCH_MINUTES = 30

type DispatchTrip = {
  id: string
  customer_id: string
  status: TripStatus
  pickup_lat: number
  pickup_lng: number
  required_certification: string
  dispatch_round: number
  estimated_fare: number | null
  prefer_female_driver: boolean
  requested_at: Date
  needs_driver_since: Date | null
}

async function loadTrip(id: string): Promise<DispatchTrip> {
  const { rows } = await pool.query<DispatchTrip>(
    `SELECT id, customer_id, status, pickup_lat, pickup_lng,
            required_certification, dispatch_round,
            estimated_fare::float8 AS estimated_fare, prefer_female_driver,
            requested_at, needs_driver_since
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
  await releaseForTrip(trip.id).catch(() => undefined)
  await broadcastStateChange(trip.id, 'NO_DRIVERS_FOUND')
}

/**
 * Nobody to offer the trip to right now. Inside the extended window the trip
 * stays REQUESTED: the first time, it is flagged for ops (the console's
 * "Waiting for a driver" list) and the customer is told a driver is coming
 * within EXTENDED_SEARCH_MINUTES; the sweeper retries it (retryWaitingTrips).
 */
async function noDriverYet(trip: DispatchTrip): Promise<void> {
  if (Date.now() - trip.requested_at.getTime() >= EXTENDED_SEARCH_MINUTES * 60_000) return endWithNoDrivers(trip)
  if (trip.needs_driver_since) return

  const client = await pool.connect()
  let flagged = false
  try {
    await client.query('BEGIN')
    const { rowCount } = await client.query(
      `UPDATE trips SET needs_driver_since = now() WHERE id = $1 AND needs_driver_since IS NULL`,
      [trip.id],
    )
    flagged = rowCount === 1
    if (flagged) {
      await recordEvent(client, trip.id, 'TRIP_NEEDS_DRIVER', null, null, { rounds_attempted: trip.dispatch_round })
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  // Same status, new flag: the customer's screen and the console both refetch.
  if (flagged) await broadcastStateChange(trip.id, 'REQUESTED')
}

/** Sweeper: give every trip in the extended search another dispatch attempt. */
export async function retryWaitingTrips(): Promise<void> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM trips WHERE status = 'REQUESTED' AND needs_driver_since IS NOT NULL`,
  )
  for (const r of rows) await startDispatch(r.id).catch((err) => console.error('dispatch retry failed', r.id, err))
}

/**
 * Offer the trip to the best remaining candidate. Drivers already offered this
 * trip in an earlier round are excluded so a decline is not re-sent.
 */
export async function startDispatch(tripId: string): Promise<void> {
  const trip = await loadTrip(tripId)
  if (trip.status !== 'REQUESTED') return

  // The round cap applies to the first search only; the extended search keeps
  // offering to drivers who came online since, until its window closes.
  if (trip.dispatch_round >= MAX_DISPATCH_ROUNDS && !trip.needs_driver_since) return noDriverYet(trip)
  if (trip.needs_driver_since && Date.now() - trip.requested_at.getTime() >= EXTENDED_SEARCH_MINUTES * 60_000) {
    return endWithNoDrivers(trip)
  }

  // Night Shield is a hard protocol: inside 22:00-05:00 IST only a currently
  // qualified driver may be offered the trip.
  const candidates = await findNearbyDrivers(
    { lat: trip.pickup_lat, lng: trip.pickup_lng },
    SEARCH_RADIUS_KM,
    trip.required_certification,
    10,
    isNightPickupIST(new Date()),
    trip.prefer_female_driver,
  )

  const { rows: alreadyOffered } = await pool.query<{ driver_id: string }>(
    `SELECT driver_id FROM trip_offers WHERE trip_id = $1`,
    [tripId],
  )
  const seen = new Set(alreadyOffered.map((r) => r.driver_id))
  const driverId = candidates.find((id) => !seen.has(id))

  if (!driverId) return noDriverYet(trip)

  const round = trip.dispatch_round + 1
  // Raised before the offer is written so the driver's poll can never see the
  // row without the flag. If the insert rolls back, the flag just expires.
  await flagPendingOffer(driverId, OFFER_TTL_SECONDS)
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
      data: { type: 'TRIP_OFFER', trip_id: tripId, expires_in: String(OFFER_TTL_SECONDS) },
      channel: 'offers',
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

    if (accept) {
      await requireApprovedDriver(driverId, client)
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

  // Any answer, yes or no, proves someone is behind the phone.
  await clearMissedOffers(driverId).catch(() => undefined)

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

/**
 * A driver who loses approval keeps no trip that has not started. Offered
 * (MATCHED) trips go back to dispatch, as if declined; accepted ones still on
 * the way to the pickup (HANDSHAKE_PENDING) are cancelled with no fee, since
 * the customer did nothing wrong. Trips already under way are left to the
 * caller, which escalates them.
 */
export async function withdrawUnapprovedDriver(
  driverId: string,
  actorId: string,
  actorRole: Role,
): Promise<{ redispatched: string[]; cancelled: string[] }> {
  const redispatched: string[] = []
  const cancelled: string[] = []
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows: offers } = await client.query<{ trip_id: string }>(
      `UPDATE trip_offers SET status = 'EXPIRED', responded_at = now()
        WHERE driver_id = $1 AND status = 'PENDING'
        RETURNING trip_id`,
      [driverId],
    )
    for (const { trip_id: tripId } of offers) {
      const { rows } = await client.query<{ status: TripStatus }>(
        `SELECT status FROM trips WHERE id = $1 FOR UPDATE`,
        [tripId],
      )
      if (rows[0]?.status !== 'MATCHED') continue
      await transitionTrip(client, tripId, 'MATCHED', 'REQUESTED')
      await recordEvent(client, tripId, 'OFFER_WITHDRAWN', actorId, actorRole, { driver_id: driverId })
      redispatched.push(tripId)
    }

    const { rows: accepted } = await client.query<{ id: string }>(
      `SELECT id FROM trips WHERE driver_id = $1 AND status = 'HANDSHAKE_PENDING' FOR UPDATE`,
      [driverId],
    )
    for (const { id: tripId } of accepted) {
      await transitionTrip(client, tripId, 'HANDSHAKE_PENDING', 'CANCELLED', {
        cancelled_at: new Date(),
        cancellation_reason: 'Driver no longer approved',
        cancelled_by: actorId,
      })
      await recordEvent(client, tripId, 'TRIP_CANCELLED', actorId, actorRole, {
        reason: 'DRIVER_UNAPPROVED',
        driver_id: driverId,
      })
      cancelled.push(tripId)
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  // After commit: payments, links and broadcasts cannot be rolled back.
  for (const tripId of cancelled) {
    await revokeLinksForEndedTrip(tripId).catch(() => undefined)
    await releaseForTrip(tripId).catch(() => undefined)
    await broadcastStateChange(tripId, 'CANCELLED').catch(() => undefined)
  }
  for (const tripId of redispatched) {
    await broadcastStateChange(tripId, 'REQUESTED').catch(() => undefined)
    await startDispatch(tripId).catch(() => undefined)
  }
  return { redispatched, cancelled }
}
