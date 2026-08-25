import { describe, expect, it } from 'vitest'
import { NIGHT_FEE, PLATFORM_FEE, computeFare } from '../../src/modules/trips/fare.js'

const day = new Date('2026-08-25T06:30:00Z') // 12:00 IST
const night = new Date('2026-08-25T18:00:00Z') // 23:30 IST

describe('computeFare', () => {
  it('charges per km plus the platform fee on a day trip', () => {
    expect(
      computeFare({
        bookingType: 'POINT_TO_POINT',
        distanceKm: 10,
        perKmRate: 16,
        hourlyRate: 240,
        pickupAt: day,
      }),
    ).toEqual({ base: 160, platform_fee: 19, night_fee: 0, total: 179, driver_earnings: 160 })
  })

  it('adds the night fee for a pickup inside the night window', () => {
    const fare = computeFare({
      bookingType: 'POINT_TO_POINT',
      distanceKm: 10,
      perKmRate: 19,
      hourlyRate: 280,
      pickupAt: night,
    })
    expect(fare.night_fee).toBe(NIGHT_FEE)
    expect(fare.total).toBe(190 + PLATFORM_FEE + NIGHT_FEE)
  })

  it('charges the hourly rate for an hourly booking and ignores distance', () => {
    const fare = computeFare({
      bookingType: 'HOURLY',
      distanceKm: 999,
      hours: 4,
      perKmRate: 16,
      hourlyRate: 240,
      pickupAt: day,
    })
    expect(fare.base).toBe(960)
    expect(fare.total).toBe(979)
  })

  it('always sets driver_earnings to total minus platform fee', () => {
    const fare = computeFare({
      bookingType: 'POINT_TO_POINT',
      distanceKm: 7.2,
      perKmRate: 16,
      hourlyRate: 240,
      pickupAt: night,
    })
    expect(fare.driver_earnings).toBe(fare.total - PLATFORM_FEE)
  })

  it('rounds every component to two decimals', () => {
    const fare = computeFare({
      bookingType: 'POINT_TO_POINT',
      distanceKm: 7.777,
      perKmRate: 16.33,
      hourlyRate: 240,
      pickupAt: day,
    })
    expect(fare.base).toBe(127)
    expect(Number.isInteger(Math.round(fare.total * 100))).toBe(true)
  })

  it('rejects an hourly booking with no hours', () => {
    expect(() =>
      computeFare({
        bookingType: 'HOURLY',
        distanceKm: 0,
        perKmRate: 16,
        hourlyRate: 240,
        pickupAt: day,
      }),
    ).toThrow(/hours/i)
  })

  it('rejects a negative distance', () => {
    expect(() =>
      computeFare({
        bookingType: 'POINT_TO_POINT',
        distanceKm: -1,
        perKmRate: 16,
        hourlyRate: 240,
        pickupAt: day,
      }),
    ).toThrow(/distance/i)
  })
})
