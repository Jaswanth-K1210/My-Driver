import { estimateRoadDistanceKm, type LatLng } from '../../lib/geo.js'
import { isNightPickupIST } from '../../lib/time.js'

// Defaults only: the live values are in pricing_fees, which ops edit from the
// console (fees.ts). These seed that row and price anything given no fees.
export const PLATFORM_FEE = 19
export const NIGHT_FEE = 30
export const CITY_STOP_FEE = 60
export const INTERCITY_STOP_FEE = 100
export const ARRIVAL_CANCELLATION_FEE = 100
export const URGENT_FEE = 49

export type Fees = {
  platform_fee: number
  night_fee: number
  city_stop_fee: number
  intercity_stop_fee: number
  /** Charged when the customer cancels after the driver has arrived. */
  arrival_cancellation_fee: number
  /** Added when the customer asks for a driver in 5-10 minutes. */
  urgent_fee: number
}

export const DEFAULT_FEES: Fees = {
  platform_fee: PLATFORM_FEE,
  night_fee: NIGHT_FEE,
  city_stop_fee: CITY_STOP_FEE,
  intercity_stop_fee: INTERCITY_STOP_FEE,
  arrival_cancellation_fee: ARRIVAL_CANCELLATION_FEE,
  urgent_fee: URGENT_FEE,
}

export type BookingType = 'POINT_TO_POINT' | 'HOURLY'

export type FareInput = {
  bookingType: BookingType
  distanceKm: number
  hours?: number | undefined
  perKmRate: number
  hourlyRate: number
  pickupAt: Date
  stopsFee?: number | undefined
  /** The urgent fee charged on this trip, 0 for a normal booking. */
  urgentFee?: number | undefined
  fees?: Fees | undefined
}

export type FareBreakdown = {
  /** Distance or hours, plus stops_fee. */
  base: number
  stops_fee: number
  platform_fee: number
  night_fee: number
  urgent_fee: number
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
  fees?: Fees | undefined
}): { distanceKm: number; stopsFee: number } {
  const { pickup, drop, stops, returnStops, returnDrop, tripType, requirement } = params
  const fees = params.fees ?? DEFAULT_FEES
  if (!drop) return { distanceKm: 0, stopsFee: 0 }

  const validOutboundStops = extractValidStopCoords(stops)
  const isTwoWay = tripType === 'two_way'
  const validReturnStops = isTwoWay ? extractValidStopCoords(returnStops) : []
  const totalStopsCount = validOutboundStops.length + validReturnStops.length
  const stopsFee =
    totalStopsCount * (requirement === 'inter_city' ? fees.intercity_stop_fee : fees.city_stop_fee)

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

  const fees = input.fees ?? DEFAULT_FEES
  const stopsFee = input.bookingType === 'HOURLY' ? 0 : (input.stopsFee ?? 0)
  const base = round2(
    input.bookingType === 'HOURLY'
      ? input.hourlyRate * input.hours!
      : input.perKmRate * input.distanceKm + stopsFee,
  )

  const night_fee = isNightPickupIST(input.pickupAt) ? fees.night_fee : 0
  const urgent_fee = input.urgentFee ?? 0
  const total = round2(base + fees.platform_fee + night_fee + urgent_fee)

  return {
    base,
    stops_fee: round2(stopsFee),
    platform_fee: fees.platform_fee,
    night_fee,
    urgent_fee,
    total,
    driver_earnings: round2(total - fees.platform_fee),
  }
}
