import { pool } from '../../db/client.js'
import type { LatLng } from '../../lib/geo.js'
import { redis } from '../../redis/client.js'
import { ensureDriverProfile } from './rate-cards.js'

export const GEO_KEY = 'drivers:online'
export const GEO_REFRESH_SECONDS = 10
export const SEARCH_RADIUS_KM = 5

export type Availability = 'OFFLINE' | 'ONLINE' | 'ON_TRIP'

export async function setAvailability(
  userId: string,
  availability: Availability,
  at?: LatLng,
): Promise<void> {
  await ensureDriverProfile(userId)
  await pool.query(
    `UPDATE driver_profiles SET availability = $2, updated_at = now() WHERE user_id = $1`,
    [userId, availability],
  )

  if (availability !== 'ONLINE') {
    await removeDriverFromIndex(userId)
    return
  }

  // Dispatch searches the Redis geo index, so a driver who goes ONLINE without
  // a position is invisible to it until their first telemetry frame arrives.
  // Seeding it here closes that window.
  if (at) await upsertDriverLocation(userId, at, { force: true })
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
): Promise<string[]> {
  const nearby = (await redis.georadius(
    GEO_KEY,
    at.lng,
    at.lat,
    radiusKm,
    'km',
    'ASC',
    'COUNT',
    limit * 4,
  )) as string[]

  if (nearby.length === 0) return []

  const { rows } = await pool.query<{ user_id: string }>(
    `SELECT user_id
       FROM driver_profiles
      WHERE user_id = ANY($1::uuid[])
        AND availability = 'ONLINE'
        AND $2 = ANY(certifications)
      ORDER BY mydriver_score DESC
      LIMIT $3`,
    [nearby, certification, limit],
  )

  const eligible = new Set(rows.map((r) => r.user_id))
  // Preserve the distance ordering Redis gave us, filtered to eligible drivers.
  return nearby.filter((id) => eligible.has(id))
}
