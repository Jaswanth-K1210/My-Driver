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
