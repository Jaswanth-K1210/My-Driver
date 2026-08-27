import { randomInt } from 'node:crypto'
import type { PoolClient } from 'pg'
import { pool } from '../../db/client.js'
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors.js'
import { estimateRoadDistanceKm, polylineDistanceKm, type LatLng } from '../../lib/geo.js'
import { peppered } from '../../lib/hash.js'
import { getTelemetryWriter, readTripTrack } from '../../telemetry/batch-writer.js'
import type { Role } from '../auth/otp.js'
import { revokeLinksForEndedTrip } from '../guardian/service.js'
import { broadcastStateChange } from './broadcast.js'
import { computeFare } from './fare.js'
import { setAvailability } from './geo-index.js'
import { getRateCard } from './rate-cards.js'
import { assertTransition, CANCELLABLE_FROM, type TripStatus } from './state-machine.js'

export const HANDSHAKE_OTP_DIGITS = 4
export const HANDSHAKE_MAX_ATTEMPTS = 5

export type BookingType = 'POINT_TO_POINT' | 'HOURLY'

export type TripDriver = {
  id: string
  name: string | null
  initials: string | null
  vehicle_model: string | null
  vehicle_plate: string | null
  rating: number | null
  mydriver_score: number | null
}

export type TripView = {
  id: string
  customer_id: string
  driver_id: string | null
  status: TripStatus
  booking_type: BookingType
  hourly_package_hours: number | null
  pickup: LatLng
  drop: LatLng | null
  required_certification: string
  speed_ceiling_kmh: number
  estimated_distance_km: number | null
  estimated_fare: number | null
  distance_km: number | null
  duration_min: number | null
  fare_amount: number | null
  driver_earnings: number | null
  requested_at: string
  completed_at: string | null
  driver: TripDriver | null
}

/**
 * Joined once rather than fetched per trip: a list endpoint doing a lookup per
 * row would be an N+1 on the hottest read in the customer app.
 */
const TRIP_SELECT = `
  SELECT
    t.id, t.customer_id, t.driver_id, t.status, t.booking_type, t.hourly_package_hours,
    t.pickup_lat, t.pickup_lng, t.drop_lat, t.drop_lng,
    t.required_certification, t.speed_ceiling_kmh,
    t.estimated_distance_km::float8 AS estimated_distance_km,
    t.estimated_fare::float8        AS estimated_fare,
    t.distance_km::float8           AS distance_km,
    t.duration_min,
    t.fare_amount::float8           AS fare_amount,
    t.driver_earnings::float8       AS driver_earnings,
    t.requested_at, t.completed_at,
    du.full_name          AS driver_name,
    dp.vehicle_model      AS driver_vehicle_model,
    dp.vehicle_plate      AS driver_vehicle_plate,
    dp.rating::float8     AS driver_rating,
    dp.mydriver_score::float8 AS driver_score
  FROM trips t
  LEFT JOIN users du           ON du.id = t.driver_id
  LEFT JOIN driver_profiles dp ON dp.user_id = t.driver_id
`

type RawTrip = Record<string, unknown>

const initialsOf = (name: string | null): string | null => {
  if (!name) return null
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  return (parts[0]![0]! + (parts[1]?.[0] ?? '')).toUpperCase()
}

function toView(row: RawTrip): TripView {
  const {
    pickup_lat, pickup_lng, drop_lat, drop_lng,
    driver_name, driver_vehicle_model, driver_vehicle_plate, driver_rating, driver_score,
    ...rest
  } = row

  const base = rest as Omit<TripView, 'pickup' | 'drop' | 'driver'>

  return {
    ...base,
    pickup: { lat: pickup_lat as number, lng: pickup_lng as number },
    drop: drop_lat === null ? null : { lat: drop_lat as number, lng: drop_lng as number },
    driver: base.driver_id
      ? {
          id: base.driver_id,
          name: (driver_name as string | null) ?? null,
          initials: initialsOf((driver_name as string | null) ?? null),
          vehicle_model: (driver_vehicle_model as string | null) ?? null,
          vehicle_plate: (driver_vehicle_plate as string | null) ?? null,
          rating: (driver_rating as number | null) ?? null,
          mydriver_score: (driver_score as number | null) ?? null,
        }
      : null,
  }
}

/** Append-only ledger write. Always called with the same client as the status update. */
export async function recordEvent(
  client: PoolClient,
  tripId: string,
  type: string,
  actorId: string | null,
  actorRole: Role | null,
  payload: unknown = {},
): Promise<void> {
  await client.query(
    `INSERT INTO trip_events (trip_id, type, actor_id, actor_role, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [tripId, type, actorId, actorRole, JSON.stringify(payload)],
  )
}

/**
 * Guarded status change. The WHERE clause on the current status makes this a
 * compare-and-swap: two concurrent callers cannot both win.
 */
export async function transitionTrip(
  client: PoolClient,
  tripId: string,
  from: TripStatus,
  to: TripStatus,
  patch: Record<string, unknown> = {},
): Promise<void> {
  assertTransition(from, to)

  const keys = Object.keys(patch)
  const assignments = keys.map((k, i) => `${k} = $${i + 4}`).join(', ')
  const { rowCount } = await client.query(
    `UPDATE trips SET status = $2${assignments ? ', ' + assignments : ''}
      WHERE id = $1 AND status = $3`,
    [tripId, to, from, ...keys.map((k) => patch[k])],
  )

  if (rowCount === 0) {
    throw conflict('TRIP_STATE_CHANGED', 'The trip is no longer in the expected state')
  }
}

const generateHandshakeOtp = (): string =>
  String(randomInt(0, 10 ** HANDSHAKE_OTP_DIGITS)).padStart(HANDSHAKE_OTP_DIGITS, '0')

export type BookInput = {
  customerId: string
  bookingType: BookingType
  hours?: number | undefined
  pickup: LatLng
  pickupAddress?: string | undefined
  drop?: LatLng | undefined
  dropAddress?: string | undefined
  requiredCertification: string
  speedCeilingKmh: number
  idempotencyKey?: string | undefined
}

export async function bookTrip(input: BookInput): Promise<TripView> {
  const { rows: userRows } = await pool.query<{ phone_verified_at: Date | null }>(
    `SELECT phone_verified_at FROM users WHERE id = $1`,
    [input.customerId],
  )
  if (!userRows[0]?.phone_verified_at) {
    throw forbidden('PHONE_VERIFICATION_REQUIRED', 'Verify a phone number before booking a trip')
  }

  if (input.idempotencyKey) {
    const existing = await pool.query(
      `${TRIP_SELECT} WHERE t.customer_id = $1 AND t.idempotency_key = $2`,
      [input.customerId, input.idempotencyKey],
    )
    if (existing.rows[0]) return toView(existing.rows[0])
  }

  const card = await getRateCard(input.requiredCertification)
  const distanceKm = input.drop ? estimateRoadDistanceKm(input.pickup, input.drop) : 0
  const fare = computeFare({
    bookingType: input.bookingType,
    distanceKm,
    hours: input.hours,
    perKmRate: card.per_km_rate,
    hourlyRate: card.hourly_rate,
    pickupAt: new Date(),
  })

  const otp = generateHandshakeOtp()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `INSERT INTO trips (
         customer_id, booking_type, hourly_package_hours,
         pickup_lat, pickup_lng, pickup_address,
         drop_lat, drop_lng, drop_address,
         required_certification, speed_ceiling_kmh,
         pickup_handshake_otp_hash, estimated_distance_km, estimated_fare,
         idempotency_key
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      [
        input.customerId,
        input.bookingType,
        input.hours ?? null,
        input.pickup.lat,
        input.pickup.lng,
        input.pickupAddress ?? null,
        input.drop?.lat ?? null,
        input.drop?.lng ?? null,
        input.dropAddress ?? null,
        card.skill_id,
        input.speedCeilingKmh,
        peppered(otp),
        distanceKm.toFixed(2),
        fare.total.toFixed(2),
        input.idempotencyKey ?? null,
      ],
    )
    const tripId = rows[0]!.id as string
    await recordEvent(client, tripId, 'TRIP_REQUESTED', input.customerId, 'CUSTOMER', {
      required_certification: card.skill_id,
      speed_ceiling_kmh: input.speedCeilingKmh,
      estimated_fare: fare.total,
    })
    await client.query('COMMIT')
    return getTripById(tripId)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/**
 * Unscoped read. Only for callers that have already proved their right to see
 * the trip some other way (e.g. a driver responding to an offer they were
 * sent). Everything user-facing must use getTripForParticipant.
 */
export async function getTripById(tripId: string): Promise<TripView> {
  const { rows } = await pool.query(`${TRIP_SELECT} WHERE t.id = $1`, [tripId])
  if (!rows[0]) throw notFound('TRIP_NOT_FOUND', 'No such trip')
  return toView(rows[0])
}

export async function getTripForParticipant(
  tripId: string,
  userId: string,
): Promise<TripView> {
  const { rows } = await pool.query(
    `${TRIP_SELECT} WHERE t.id = $1 AND (t.customer_id = $2 OR t.driver_id = $2)`,
    [tripId, userId],
  )
  if (!rows[0]) throw notFound('TRIP_NOT_FOUND', 'No such trip')
  return toView(rows[0])
}

/** The plaintext handshake OTP is delivered only to the customer, on their own trip. */
export async function issueHandshakeOtpForCustomer(
  tripId: string,
  customerId: string,
): Promise<string> {
  const { rows } = await pool.query<{ status: TripStatus }>(
    `SELECT status FROM trips WHERE id = $1 AND customer_id = $2`,
    [tripId, customerId],
  )
  if (!rows[0]) throw notFound('TRIP_NOT_FOUND', 'No such trip')

  // The stored value is a one-way hash, so a fresh code is minted and swapped in.
  const otp = generateHandshakeOtp()
  await pool.query(
    `UPDATE trips SET pickup_handshake_otp_hash = $2, handshake_attempts = 0 WHERE id = $1`,
    [tripId, peppered(otp)],
  )
  return otp
}

export async function completeTrip(tripId: string, driverId: string): Promise<TripView> {
  const { rows } = await pool.query<{
    status: TripStatus
    booking_type: BookingType
    hourly_package_hours: number | null
    required_certification: string
    started_at: Date | null
    estimated_distance_km: string | null
    requested_at: Date
  }>(
    `SELECT status, booking_type, hourly_package_hours, required_certification,
            started_at, estimated_distance_km, requested_at
       FROM trips WHERE id = $1 AND driver_id = $2`,
    [tripId, driverId],
  )
  const trip = rows[0]
  if (!trip) throw notFound('TRIP_NOT_FOUND', 'No such trip for this driver')

  // Flush buffered telemetry first, or the final fixes are missing from the
  // distance calculation and the customer is under-charged.
  await getTelemetryWriter().flush()

  const track = await readTripTrack(tripId)
  const trackedKm = polylineDistanceKm(track)
  const distanceKm = trackedKm > 0 ? trackedKm : Number(trip.estimated_distance_km ?? 0)

  const startedAt = trip.started_at ?? trip.requested_at
  const durationMin = Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 60_000))

  const card = await getRateCard(trip.required_certification)
  const fare = computeFare({
    bookingType: trip.booking_type,
    distanceKm,
    hours: trip.hourly_package_hours ?? undefined,
    perKmRate: card.per_km_rate,
    hourlyRate: card.hourly_rate,
    pickupAt: startedAt,
  })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Pass the trip's real status, not a hardcoded IN_TRIP: that way an
    // out-of-order call reports INVALID_TRIP_TRANSITION naming the actual
    // state, instead of a vague compare-and-swap miss.
    await transitionTrip(client, tripId, trip.status, 'COMPLETED', {
      completed_at: new Date(),
      distance_km: distanceKm.toFixed(2),
      duration_min: durationMin,
      fare_amount: fare.total.toFixed(2),
      platform_fee: fare.platform_fee.toFixed(2),
      night_fee: fare.night_fee.toFixed(2),
      driver_earnings: fare.driver_earnings.toFixed(2),
    })
    await client.query(
      `UPDATE driver_profiles SET total_trips = total_trips + 1, updated_at = now()
        WHERE user_id = $1`,
      [driverId],
    )
    await recordEvent(client, tripId, 'TRIP_COMPLETED', driverId, 'DRIVER', {
      distance_km: distanceKm,
      duration_min: durationMin,
      fare: fare.total,
    })
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  await setAvailability(driverId, 'ONLINE')
  await revokeLinksForEndedTrip(tripId).catch(() => undefined)
  await broadcastStateChange(tripId, 'COMPLETED')
  return getTripForParticipant(tripId, driverId)
}

export async function cancelTrip(
  tripId: string,
  userId: string,
  role: Role,
  reason: string,
): Promise<TripView> {
  const { rows } = await pool.query<{ status: TripStatus; driver_id: string | null }>(
    `SELECT status, driver_id FROM trips
      WHERE id = $1 AND (customer_id = $2 OR driver_id = $2)`,
    [tripId, userId],
  )
  const trip = rows[0]
  if (!trip) throw notFound('TRIP_NOT_FOUND', 'No such trip')

  if (!CANCELLABLE_FROM.includes(trip.status)) {
    throw conflict('TRIP_NOT_CANCELLABLE', `A trip in ${trip.status} cannot be cancelled`)
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await transitionTrip(client, tripId, trip.status, 'CANCELLED', {
      cancelled_at: new Date(),
      cancellation_reason: reason,
      cancelled_by: userId,
    })
    await client.query(
      `UPDATE trip_offers SET status = 'EXPIRED', responded_at = now()
        WHERE trip_id = $1 AND status = 'PENDING'`,
      [tripId],
    )
    await recordEvent(client, tripId, 'TRIP_CANCELLED', userId, role, { reason })
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  if (trip.driver_id) await setAvailability(trip.driver_id, 'ONLINE')
  await revokeLinksForEndedTrip(tripId).catch(() => undefined)
  await broadcastStateChange(tripId, 'CANCELLED')
  return getTripForParticipant(tripId, userId)
}

/**
 * Keyset pagination. The cursor encodes (requested_at, id), which is exactly
 * the index order, so page 10,000 costs the same as page 1. No OFFSET anywhere.
 */
const encodeCursor = (requestedAt: Date, id: string): string =>
  Buffer.from(`${requestedAt.toISOString()}|${id}`).toString('base64url')

function decodeCursor(cursor: string): { at: string; id: string } {
  const [at, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
  if (!at || !id) throw badRequest('INVALID_CURSOR', 'The pagination cursor is malformed')
  return { at, id }
}

export async function listTrips(
  userId: string,
  role: Role,
  cursor?: string,
  limit = 20,
): Promise<{ items: TripView[]; next_cursor: string | null }> {
  const column = role === 'DRIVER' ? 'driver_id' : 'customer_id'
  const params: unknown[] = [userId, limit + 1]

  let keyset = ''
  if (cursor) {
    const { at, id } = decodeCursor(cursor)
    keyset = `AND (t.requested_at, t.id) < ($3::timestamptz, $4::uuid)`
    params.push(at, id)
  }

  const { rows } = await pool.query(
    `${TRIP_SELECT} WHERE t.${column} = $1 ${keyset}
      ORDER BY t.requested_at DESC, t.id DESC
      LIMIT $2`,
    params,
  )

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page.at(-1)

  return {
    items: page.map(toView),
    next_cursor:
      hasMore && last
        ? encodeCursor(new Date(last.requested_at as string), last.id as string)
        : null,
  }
}

export async function rateTrip(
  tripId: string,
  customerId: string,
  rating: number,
  comment?: string,
): Promise<{ rating: number; driver_rating: number }> {
  const { rows } = await pool.query<{ status: TripStatus; driver_id: string | null }>(
    `SELECT status, driver_id FROM trips WHERE id = $1 AND customer_id = $2`,
    [tripId, customerId],
  )
  const trip = rows[0]
  if (!trip || !trip.driver_id) throw notFound('TRIP_NOT_FOUND', 'No such trip')
  if (trip.status !== 'COMPLETED') {
    throw conflict('TRIP_NOT_COMPLETED', 'Only a completed trip can be rated')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const inserted = await client.query(
      `INSERT INTO driver_ratings (trip_id, driver_id, rating, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (trip_id) DO NOTHING
       RETURNING trip_id`,
      [tripId, trip.driver_id, rating, comment ?? null],
    )
    if (inserted.rowCount === 0) {
      throw conflict('ALREADY_RATED', 'This trip has already been rated')
    }

    // Incremental mean: no scan of the driver's whole rating history.
    const { rows: profile } = await client.query<{ rating: number }>(
      `UPDATE driver_profiles
          SET rating_count = rating_count + 1,
              rating = ROUND(
                ((COALESCE(rating, 0) * rating_count) + $2) / (rating_count + 1), 2
              ),
              mydriver_score = LEAST(100, GREATEST(0,
                ROUND(mydriver_score * 0.9 + ($2 * 20) * 0.1, 2)
              )),
              updated_at = now()
        WHERE user_id = $1
        RETURNING rating::float8 AS rating`,
      [trip.driver_id, rating],
    )

    await recordEvent(client, tripId, 'TRIP_RATED', customerId, 'CUSTOMER', { rating })
    await client.query('COMMIT')

    return { rating, driver_rating: Number(profile[0]?.rating ?? rating) }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export type DriverSummary = {
  mydriver_score: number
  rating: number | null
  total_trips: number
  trips_today: number
  earnings_today: number
  availability: 'OFFLINE' | 'ONLINE' | 'ON_TRIP'
}

export async function getDriverSummary(driverId: string): Promise<DriverSummary> {
  const { rows } = await pool.query<DriverSummary>(
    `SELECT
       p.mydriver_score::float8 AS mydriver_score,
       p.rating::float8         AS rating,
       p.total_trips,
       p.availability,
       COALESCE(t.trips_today, 0)::int       AS trips_today,
       COALESCE(t.earnings_today, 0)::float8 AS earnings_today
     FROM driver_profiles p
     LEFT JOIN LATERAL (
       SELECT count(*) AS trips_today, sum(driver_earnings) AS earnings_today
         FROM trips
        WHERE driver_id = p.user_id
          AND status = 'COMPLETED'
          -- The trailing AT TIME ZONE converts IST midnight back to a
          -- timestamptz. Without it Postgres compares a naive timestamp as UTC,
          -- so between 18:30 and 24:00 UTC today's earnings read as zero.
          AND completed_at >= (
            date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
          )
     ) t ON true
     WHERE p.user_id = $1`,
    [driverId],
  )
  if (!rows[0]) throw notFound('DRIVER_NOT_FOUND', 'No driver profile')
  return rows[0]
}

export type PendingOffer = {
  trip_id: string
  expires_at: string
  pickup: LatLng
  drop: LatLng | null
  pickup_address: string | null
  drop_address: string | null
  required_certification: string
  speed_ceiling_kmh: number
  estimated_distance_km: number | null
  estimated_fare: number | null
  driver_earnings_estimate: number | null
  // Phase 1 rates drivers only (driver_ratings) — there is no customer
  // rating to show on the offer card.
  customer: { name: string | null }
}

/**
 * Offers a driver can still accept.
 *
 * A driver is not a trip participant until they accept — `trips.driver_id` is
 * NULL while the offer is pending — so they cannot SUBSCRIBE to the trip
 * channel that carries TRIP_OFFER, and `listTrips` (which filters on
 * driver_id) cannot see it either. Without this endpoint a pending offer is
 * unreachable from any client. The driver app polls it while ONLINE.
 */
export async function listPendingOffers(driverId: string): Promise<PendingOffer[]> {
  const { rows } = await pool.query(
    `SELECT o.trip_id,
            o.expires_at,
            t.pickup_lat::float8              AS pickup_lat,
            t.pickup_lng::float8              AS pickup_lng,
            t.drop_lat::float8                AS drop_lat,
            t.drop_lng::float8                AS drop_lng,
            t.pickup_address,
            t.drop_address,
            t.required_certification,
            t.speed_ceiling_kmh,
            t.estimated_distance_km::float8   AS estimated_distance_km,
            t.estimated_fare::float8          AS estimated_fare,
            u.full_name                       AS customer_name
       FROM trip_offers o
       JOIN trips t  ON t.id = o.trip_id
       JOIN users u  ON u.id = t.customer_id
      WHERE o.driver_id = $1
        AND o.status = 'PENDING'
        AND o.expires_at > now()
        AND t.status = 'MATCHED'
      ORDER BY o.sent_at DESC`,
    [driverId],
  )

  return rows.map((r) => ({
    trip_id: r.trip_id,
    expires_at: new Date(r.expires_at).toISOString(),
    pickup: { lat: r.pickup_lat, lng: r.pickup_lng },
    drop: r.drop_lat === null ? null : { lat: r.drop_lat, lng: r.drop_lng },
    pickup_address: r.pickup_address,
    drop_address: r.drop_address,
    required_certification: r.required_certification,
    speed_ceiling_kmh: r.speed_ceiling_kmh,
    estimated_distance_km: r.estimated_distance_km,
    estimated_fare: r.estimated_fare,
    // The same 80% split computeFare() applies, so the driver sees take-home.
    driver_earnings_estimate:
      r.estimated_fare === null ? null : Math.round(r.estimated_fare * 0.8 * 100) / 100,
    customer: { name: r.customer_name },
  }))
}
