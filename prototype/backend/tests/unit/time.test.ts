import { describe, expect, it } from 'vitest'
import { isNightPickupIST } from '../../src/lib/time.js'

// IST is UTC+05:30. 22:00 IST == 16:30 UTC. 05:00 IST == 23:30 UTC previous day.
describe('isNightPickupIST', () => {
  it('is night at 22:00 IST exactly (inclusive lower bound)', () => {
    expect(isNightPickupIST(new Date('2026-08-25T16:30:00Z'))).toBe(true)
  })

  it('is night at 02:00 IST', () => {
    expect(isNightPickupIST(new Date('2026-08-25T20:30:00Z'))).toBe(true)
  })

  it('is not night at 05:00 IST exactly (exclusive upper bound)', () => {
    expect(isNightPickupIST(new Date('2026-08-25T23:30:00Z'))).toBe(false)
  })

  it('is not night at 21:59 IST', () => {
    expect(isNightPickupIST(new Date('2026-08-25T16:29:00Z'))).toBe(false)
  })

  it('is not night at midday IST', () => {
    expect(isNightPickupIST(new Date('2026-08-25T06:30:00Z'))).toBe(false)
  })
})
