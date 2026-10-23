import { createHash } from 'node:crypto'
import { env } from '../../config/env.js'
import { getMapsProvider, type Place } from '../../providers/maps/index.js'
import { redis } from '../../redis/client.js'

/** Same words, same case-insensitive spacing: same cache entry. */
export const normaliseQuery = (q: string): string => q.trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * Cache key: the query plus the bias point rounded to ~1 km. Searches a few
 * metres apart share an entry; searches from across the city do not, because
 * "Metro station" means a different place there.
 */
function cacheKey(q: string, near?: { lat: number; lng: number }): string {
  const bias = near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : '-'
  const digest = createHash('sha256').update(`${getMapsProvider().name}|${bias}|${q}`).digest('hex').slice(0, 32)
  return `loc:search:${digest}`
}

// Identical searches already in flight on this instance share one upstream
// call, so ten users typing "airport" at once cost Google one request.
const inflight = new Map<string, Promise<Place[]>>()

export async function searchLocations(
  rawQuery: string,
  near?: { lat: number; lng: number },
): Promise<{ results: Place[]; cached: boolean }> {
  const q = normaliseQuery(rawQuery)
  const key = cacheKey(q, near)

  const hit = await redis.get(key)
  if (hit) return { results: JSON.parse(hit) as Place[], cached: true }

  let pending = inflight.get(key)
  if (!pending) {
    pending = getMapsProvider()
      .search(q, near)
      .then(async (results) => {
        // Empty results are cached too, but briefly: a typo should not cost
        // a paid call on every keystroke, yet a new place should show up soon.
        await redis.set(key, JSON.stringify(results), 'EX', results.length ? env.LOCATION_CACHE_TTL_SECONDS : 600)
        return results
      })
      .finally(() => inflight.delete(key))
    inflight.set(key, pending)
  }
  return { results: await pending, cached: false }
}

/**
 * Cached by the pin rounded to ~10 m: a customer nudging a pin back and forth
 * does not pay for a lookup each time.
 */
export async function reverseLocation(at: { lat: number; lng: number }): Promise<Place> {
  const key = `loc:reverse:${getMapsProvider().name}:${at.lat.toFixed(4)},${at.lng.toFixed(4)}`
  const hit = await redis.get(key)
  // The label is shared; the coordinates are always the caller's own pin.
  if (hit) return { ...(JSON.parse(hit) as Place), lat: at.lat, lng: at.lng }
  const place = await getMapsProvider().reverse(at)
  await redis.set(key, JSON.stringify(place), 'EX', env.LOCATION_CACHE_TTL_SECONDS)
  return place
}
