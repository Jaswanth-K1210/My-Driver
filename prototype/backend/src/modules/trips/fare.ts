import { isNightPickupIST } from '../../lib/time.js'

export const PLATFORM_FEE = 19
export const NIGHT_FEE = 30

export type BookingType = 'POINT_TO_POINT' | 'HOURLY'

export type FareInput = {
  bookingType: BookingType
  distanceKm: number
  hours?: number | undefined
  perKmRate: number
  hourlyRate: number
  pickupAt: Date
}

export type FareBreakdown = {
  base: number
  platform_fee: number
  night_fee: number
  total: number
  driver_earnings: number
}

const round2 = (n: number): number => Math.round(n * 100) / 100

export function computeFare(input: FareInput): FareBreakdown {
  if (input.bookingType === 'HOURLY' && (!input.hours || input.hours <= 0)) {
    throw new Error('An hourly booking requires a positive number of hours')
  }
  if (input.bookingType === 'POINT_TO_POINT' && input.distanceKm < 0) {
    throw new Error('distanceKm must not be negative')
  }

  const base = round2(
    input.bookingType === 'HOURLY'
      ? input.hourlyRate * input.hours!
      : input.perKmRate * input.distanceKm,
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
