import { describe, expect, it } from 'vitest'
import {
  ROAD_FACTOR,
  estimateRoadDistanceKm,
  haversineMeters,
  polylineDistanceKm,
} from '../../src/lib/geo.js'

const hitecCity = { lat: 17.4399, lng: 78.3813 }
const gachibowli = { lat: 17.4483, lng: 78.3915 }

describe('haversineMeters', () => {
  it('returns zero for identical points', () => {
    expect(haversineMeters(hitecCity, hitecCity)).toBe(0)
  })

  it('measures a known short distance within 2% tolerance', () => {
    // Independently derived: dLat 0.0084 deg ~= 934 m,
    // dLng 0.0102 deg x cos(17.44 deg) ~= 1082 m, hypotenuse ~= 1429 m.
    const d = haversineMeters(hitecCity, gachibowli)
    expect(d).toBeGreaterThan(1401)
    expect(d).toBeLessThan(1458)
  })

  it('is symmetric', () => {
    expect(haversineMeters(hitecCity, gachibowli)).toBeCloseTo(
      haversineMeters(gachibowli, hitecCity),
      6,
    )
  })
})

describe('estimateRoadDistanceKm', () => {
  it('applies the 1.35 road factor to the straight-line distance', () => {
    const straightKm = haversineMeters(hitecCity, gachibowli) / 1000
    expect(estimateRoadDistanceKm(hitecCity, gachibowli)).toBeCloseTo(straightKm * ROAD_FACTOR, 6)
  })

  it('uses exactly 1.35 as the factor', () => {
    expect(ROAD_FACTOR).toBe(1.35)
  })
})

describe('polylineDistanceKm', () => {
  it('returns zero for fewer than two points', () => {
    expect(polylineDistanceKm([])).toBe(0)
    expect(polylineDistanceKm([hitecCity])).toBe(0)
  })

  it('sums consecutive segments without applying a road factor', () => {
    const mid = { lat: 17.4441, lng: 78.3864 }
    const expected = (haversineMeters(hitecCity, mid) + haversineMeters(mid, gachibowli)) / 1000
    expect(polylineDistanceKm([hitecCity, mid, gachibowli])).toBeCloseTo(expected, 9)
  })
})
