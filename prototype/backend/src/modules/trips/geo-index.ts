import type { PoolClient } from 'pg'
import { env } from '../../config/env.js'
import { pool } from '../../db/client.js'
import { forbidden } from '../../lib/errors.js'
import type { LatLng } from '../../lib/geo.js'
import { redis } from '../../redis/client.js'
import { ensureDriverProfile } from './rate-cards.js'

export const GEO_KEY = 'drivers:online'
export const GEO_REFRESH_SECONDS = 10
// 5 km in a real city. Development searches 250 km so a laptop-located test
// driver is found wherever the simulator or browser places the customer.
export const SEARCH_RADIUS_KM = env.NODE_ENV === 'development' ? 250 : 5

export type Availability = 'OFFLINE' | 'ONLINE' | 'ON_TRIP'

type Queryable = Pick<PoolClient, 'query'>

/**
 * Authoritative server-side check that a driver is currently APPROVED.
 * Used by every endpoint that enables new driver activity (going ONLINE,
 * fetching offers, accepting an offer, or starting a trip at handshake).
 */
export async function requireApprovedDriver(
  userId: string,
  db: Queryable = pool,
): Promise<Availability> {
  const { rows } = await db.query<{ onboarding_status: string; availability: Availability }>(
    `SELECT onboarding_status, availability FROM driver_profiles WHERE user_id = $1`,
    [userId],
  )
  const status = rows[0]?.onboarding_status ?? 'PENDING'
  if (status !== 'APPROVED') {
    throw forbidden(
      'DRIVER_NOT_APPROVED',
      `Driver approval is required for this action (current status: ${status})`,
      { onboarding_status: status },
    )
  }
  return rows[0]!.availability
}

export async function setAvailability(
  userId: string,
  availability: Availability,
  at?: LatLng,
  opts: { skipApprovalCheck?: boolean } = {},
): Promise<void> {
  await ensureDriverProfile(userId)
  if (availability === 'ONLINE' && !opts.skipApprovalCheck) {
    await requireApprovedDriver(userId)
  }
  await pool.query(
    `UPDATE driver_profiles SET availability = $2, updated_at = now() WHERE user_id = $1`,
    [userId, availability],
  )

  // Only OFFLINE leaves the index. An ON_TRIP driver keeps their last known
  // position, so finishing a trip puts them straight back in the running:
  // dropping them on ON_TRIP left them undispatchable forever afterwards,
  // because completing a trip restores ONLINE without a position to re-add.
  // Keeping them indexed is safe — findNearbyDrivers filters on
  // availability = 'ONLINE' in SQL, so they cannot be offered a second trip.
  if (availability === 'OFFLINE') {
    await removeDriverFromIndex(userId)
    return
  }

  // Dispatch searches the geo index, so a driver going ONLINE without a
  // position would be invisible until their first telemetry frame.
  if (at) await upsertDriverLocation(userId, at, { force: true })
}

/**
 * Called when an assigned trip ends (complete or cancel). Restores ONLINE only
 * if the driver is still APPROVED; if the driver was suspended or unapproved
 * mid-trip, forces them OFFLINE and removes them from the dispatch geo index.
 */
export async function restoreAvailabilityAfterTrip(userId: string): Promise<Availability> {
  const { rows } = await pool.query<{ onboarding_status: string }>(
    `SELECT onboarding_status FROM driver_profiles WHERE user_id = $1`,
    [userId],
  )
  const approved = rows[0]?.onboarding_status === 'APPROVED'
  const next: Availability = approved ? 'ONLINE' : 'OFFLINE'
  await setAvailability(userId, next, undefined, { skipApprovalCheck: true })
  return next
}

/**
 * Dispatch does not need 3-second precision, so the geo index is refreshed at
 * most once per driver per 10 seconds. At 200k concurrent trips this turns
 * ~66k GEOADDs/second into ~6.6k.
 */
export async function upsertDriverLocation(
  userId: string,
  at: LatLng,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  const throttleKey = `geo:throttle:${userId}`

  if (!opts.force) {
    const fresh = await redis.set(throttleKey, '1', 'EX', GEO_REFRESH_SECONDS, 'NX')
    if (fresh === null) return false
  } else {
    await redis.set(throttleKey, '1', 'EX', GEO_REFRESH_SECONDS)
  }

  await redis.geoadd(GEO_KEY, at.lng, at.lat, userId)
  return true
}

/** In the dispatch index: online (or on a trip) and still approved. */
export async function isIndexed(userId: string): Promise<boolean> {
  return (await redis.zscore(GEO_KEY, userId)) !== null
}

export async function removeDriverFromIndex(userId: string): Promise<void> {
  await redis.zrem(GEO_KEY, userId)
  await redis.del(`geo:throttle:${userId}`)
}

/**
 * Redis narrows by geography; Postgres narrows by certification and
 * availability. Doing it in that order keeps the SQL predicate over a handful
 * of candidate ids rather than the whole driver table.
 */
export async function findNearbyDrivers(
  at: LatLng,
  radiusKm: number,
  certification: string,
  limit: number,
  requireNightShield = false,
  // A preference, not a filter: female drivers in range are offered first,
  // and the trip still goes to anyone else if none accepts.
  preferFemale = false,
): Promise<string[]> {
  const nearby = (await redis.georadius(
    GEO_KEY,
    at.lng,
    at.lat,
    radiusKm,
    'km',
    'ASC',
    'COUNT',
    Math.max(100, limit * 4),
  )) as string[]

  if (nearby.length === 0) return []

  const { rows } = await pool.query<{ user_id: string; gender: string | null }>(
    // Every dispatch path routes through this one query, so every eligibility
    // rule lives here and only here. A badge, an approval flag or a Night
    // Shield qualification that this predicate does not read would be
    // decoration rather than a control.
    `SELECT user_id, gender
       FROM driver_profiles
      WHERE user_id = ANY($1::uuid[])
        AND availability = 'ONLINE'
        AND $2 = ANY(certifications)
        AND onboarding_status = 'APPROVED'
        AND (NOT $4::boolean OR night_shield_certified)
        -- Demo drivers fill the console map but nobody is behind them to accept.
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = user_id AND u.is_demo)
      ORDER BY mydriver_score DESC
      LIMIT $3`,
    [nearby, certification, limit, requireNightShield],
  )

  const eligible = new Set(rows.map((r) => r.user_id))
  // Preserve the distance ordering Redis gave us, filtered to eligible drivers.
  const ordered = nearby.filter((id) => eligible.has(id))
  if (!preferFemale) return ordered
  const female = new Set(rows.filter((r) => r.gender === 'FEMALE').map((r) => r.user_id))
  return [...ordered.filter((id) => female.has(id)), ...ordered.filter((id) => !female.has(id))]
}
