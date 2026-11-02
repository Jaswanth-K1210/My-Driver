import { describe, expect, it } from 'vitest'
import {
  ROAD_FACTOR,
  estimateRoadDistanceKm,
  haversineMeters,
  polylineDistanceKm,
  trackDistanceKm,
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

describe('trackDistanceKm', () => {
  const t0 = Date.UTC(2026, 0, 1)
  const at = (sec: number, p: { lat: number; lng: number }) => ({ ...p, time: new Date(t0 + sec * 1000) })
  // ~1.11 m of latitude per 0.00001 degrees.
  const north = (m: number) => ({ lat: hitecCity.lat + m / 111_195, lng: hitecCity.lng })

  it('bills nothing for a parked phone wandering a few metres', () => {
    const jitter = Array.from({ length: 600 }, (_, i) => at(i, north(i % 2 ? 4 : -4)))
    expect(polylineDistanceKm(jitter)).toBeGreaterThan(4)
    expect(trackDistanceKm(jitter).km).toBe(0)
  })

  it('counts real driving', () => {
    // 2 km north at ~36 km/h, one fix a second.
    const drive = Array.from({ length: 201 }, (_, i) => at(i, north(i * 10)))
    expect(trackDistanceKm(drive).km).toBeCloseTo(2, 1)
  })

  it('skips a single GPS jump', () => {
    const route = [at(0, north(0)), at(1, north(10)), at(2, north(3000)), at(3, north(20)), at(4, north(30))]
    const { km, rejected } = trackDistanceKm(route)
    expect(km).toBeCloseTo(0.03, 2)
    expect(rejected).toBe(1)
  })

  it('recovers when the first fix was the bad one', () => {
    const route = [at(0, north(5000)), ...Array.from({ length: 30 }, (_, i) => at(i + 1, north(i * 10)))]
    // The jump to the real track is never billed; the drive after it is.
    expect(trackDistanceKm(route).km).toBeGreaterThan(0.2)
    expect(trackDistanceKm(route).km).toBeLessThan(0.3)
  })
})
