export type LatLng = { lat: number; lng: number }

/** Multiplier turning straight-line distance into an estimated road distance. */
export const ROAD_FACTOR = 1.35

const EARTH_RADIUS_M = 6_371_008.8
const toRad = (deg: number): number => (deg * Math.PI) / 180

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Booking-time estimate. Phase 1 uses no external routing provider. */
export function estimateRoadDistanceKm(a: LatLng, b: LatLng): number {
  return (haversineMeters(a, b) / 1000) * ROAD_FACTOR
}

/**
 * Actual travelled distance, summed over recorded GPS fixes.
 * No road factor: these are real positions, not an estimate.
 */
export function polylineDistanceKm(points: LatLng[]): number {
  let meters = 0
  for (let i = 1; i < points.length; i++) {
    meters += haversineMeters(points[i - 1]!, points[i]!)
  }
  return meters / 1000
}

export type TrackPoint = LatLng & { time: Date }

/** Faster than this between two fixes is a GPS jump, not driving. */
export const MAX_PLAUSIBLE_KMH = 150
/** Movement under this is GPS jitter; it only counts once it adds up. */
export const MIN_STEP_METERS = 10
// A run of "jumps" this long means the anchor itself was the bad fix.
const MAX_REJECTED_RUN = 3

/**
 * Travelled distance for billing. The raw polyline over-counts: a parked
 * phone wanders a few metres every second, and one bad fix adds its whole
 * jump. So hops are measured from the last accepted fix (jitter never
 * accumulates until it is real movement) and a fix that implies an
 * impossible speed is skipped.
 */
export function trackDistanceKm(points: TrackPoint[]): { km: number; rejected: number } {
  let meters = 0
  let rejected = 0
  let run = 0
  let anchor = points[0]
  for (const p of points.slice(1)) {
    const d = haversineMeters(anchor!, p)
    const seconds = (p.time.getTime() - anchor!.time.getTime()) / 1000
    if (seconds <= 0 || (d / seconds) * 3.6 > MAX_PLAUSIBLE_KMH) {
      rejected++
      if (++run >= MAX_REJECTED_RUN) {
        // Re-anchor without billing the jump.
        anchor = p
        run = 0
      }
      continue
    }
    run = 0
    if (d < MIN_STEP_METERS) continue
    meters += d
    anchor = p
  }
  return { km: meters / 1000, rejected }
}
