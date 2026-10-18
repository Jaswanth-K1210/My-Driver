import { estimateRoadDistanceKm, type LatLng } from '../../lib/geo.js'
import { isNightPickupIST } from '../../lib/time.js'

export const PLATFORM_FEE = 19
export const NIGHT_FEE = 30
export const CITY_STOP_FEE = 60
export const INTERCITY_STOP_FEE = 100

export type BookingType = 'POINT_TO_POINT' | 'HOURLY'

export type FareInput = {
  bookingType: BookingType
  distanceKm: number
  hours?: number | undefined
  perKmRate: number
  hourlyRate: number
  pickupAt: Date
  stopsFee?: number | undefined
}

export type FareBreakdown = {
  base: number
  platform_fee: number
  night_fee: number
  total: number
  driver_earnings: number
}

const round2 = (n: number): number => Math.round(n * 100) / 100

const isLatLng = (point: unknown): point is LatLng =>
  Boolean(
    point &&
      typeof point === 'object' &&
      typeof (point as LatLng).lat === 'number' &&
      Number.isFinite((point as LatLng).lat) &&
      typeof (point as LatLng).lng === 'number' &&
      Number.isFinite((point as LatLng).lng),
  )

export function extractValidStopCoords(stops: unknown): LatLng[] {
  if (!Array.isArray(stops)) return []
  return stops.filter(isLatLng).map((s) => ({ lat: s.lat, lng: s.lng }))
}

export function estimateTripDistanceKm(params: {
  pickup: LatLng
  drop?: LatLng | null | undefined
  stops?: unknown
  returnStops?: unknown
  returnDrop?: LatLng | null | undefined
  tripType?: string | null | undefined
  requirement?: string | null | undefined
}): { distanceKm: number; stopsFee: number } {
  const { pickup, drop, stops, returnStops, returnDrop, tripType, requirement } = params
  if (!drop) return { distanceKm: 0, stopsFee: 0 }

  const validOutboundStops = extractValidStopCoords(stops)
  const isTwoWay = tripType === 'two_way'
  const validReturnStops = isTwoWay ? extractValidStopCoords(returnStops) : []
  const totalStopsCount = validOutboundStops.length + validReturnStops.length
  const stopsFee =
    totalStopsCount * (requirement === 'inter_city' ? INTERCITY_STOP_FEE : CITY_STOP_FEE)

  // Preserve exact unrounded point-to-point distance for direct single-leg calls without requirement metadata
  if (!requirement && validOutboundStops.length === 0 && !isTwoWay) {
    return {
      distanceKm: estimateRoadDistanceKm(pickup, drop),
      stopsFee: 0,
    }
  }

  const legDistance = (a: LatLng, b: LatLng) => Math.max(1, estimateRoadDistanceKm(a, b))

  let outboundKm = 0
  let cur = pickup
  for (const stop of validOutboundStops) {
    outboundKm += legDistance(cur, stop)
    cur = stop
  }
  outboundKm += legDistance(cur, drop)

  let returnKm = 0
  if (isTwoWay) {
    const finalReturn = isLatLng(returnDrop) ? returnDrop : pickup
    let retCur = drop
    for (const stop of validReturnStops) {
      returnKm += legDistance(retCur, stop)
      retCur = stop
    }
    returnKm += legDistance(retCur, finalReturn)
  }

  const totalKm = Math.max(
    3,
    Math.max(1, Math.round(outboundKm)) + (isTwoWay ? Math.max(1, Math.round(returnKm)) : 0),
  )
  return { distanceKm: totalKm, stopsFee }
}

export function computeFare(input: FareInput): FareBreakdown {
  if (input.bookingType === 'HOURLY' && (!input.hours || input.hours <= 0)) {
    throw new Error('An hourly booking requires a positive number of hours')
  }
  if (input.bookingType === 'POINT_TO_POINT' && input.distanceKm < 0) {
    throw new Error('distanceKm must not be negative')
  }

  const stopsFee = input.stopsFee ?? 0
  const base = round2(
    input.bookingType === 'HOURLY'
      ? input.hourlyRate * input.hours!
      : input.perKmRate * input.distanceKm + stopsFee,
  )

  const night_fee = isNightPickupIST(input.pickupAt) ? NIGHT_FEE : 0
  const total = round2(base + PLATFORM_FEE + night_fee)

  return {
    base,
    platform_fee: PLATFORM_FEE,
    night_fee,
    total,
    driver_earnings: round2(total - PLATFORM_FEE),
  }
}
