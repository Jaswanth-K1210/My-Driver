import { describe, expect, it } from 'vitest'
import {
  CO_LOCATION_THRESHOLD_M,
  DEVIATION_GRACE_SECONDS,
  evaluate,
  windowStart,
  type Fix,
} from '../../src/modules/integrity/evaluator.js'

const HITEC = { lat: 17.4399, lng: 78.3813 }
/** ~1.43 km from HITEC — well beyond the 150 m co-location threshold. */
const FAR = { lat: 17.4483, lng: 78.3915 }
/** ~50 m from HITEC. */
const NEAR = { lat: 17.44035, lng: 78.3813 }

const NOW = 1_800_000_000_000
const fix = (coords: { lat: number; lng: number }, over: Partial<Fix> = {}): Fix => ({
  coords,
  at: NOW,
  ...over,
})

const base = { speedCeilingKmh: 60, state: { separatedSince: null }, now: NOW }

describe('dual-GPS integrity evaluation', () => {
  it('verifies co-location when both devices are within 150 m', () => {
    const res = evaluate({ ...base, driver: fix(HITEC), customer: fix(NEAR) })

    expect(res.verified).toBe(true)
    expect(res.findings).toHaveLength(0)
    expect(res.separationMeters).toBeLessThan(CO_LOCATION_THRESHOLD_M)
    expect(res.state.separatedSince).toBeNull()
  })

  it('starts the deviation clock but does not fire inside the grace period', () => {
    const res = evaluate({ ...base, driver: fix(HITEC), customer: fix(FAR) })

    expect(res.verified).toBe(false)
    expect(res.separationMeters).toBeGreaterThan(CO_LOCATION_THRESHOLD_M)
    expect(res.state.separatedSince).toBe(NOW)
    // Separated, but only just — 60 seconds of grace must pass first.
    expect(res.findings.map((f) => f.reason)).not.toContain('ROUTE_DEVIATION_EXCEEDED')
  })

  it('raises ROUTE_DEVIATION_EXCEEDED once separation outlasts the grace period', () => {
    const separatedSince = NOW - (DEVIATION_GRACE_SECONDS + 1) * 1000
    const res = evaluate({
      ...base,
      driver: fix(HITEC),
      customer: fix(FAR),
      state: { separatedSince },
    })

    const finding = res.findings.find((f) => f.reason === 'ROUTE_DEVIATION_EXCEEDED')
    expect(finding).toBeDefined()
    expect(finding!.details.deviation_distance_meters).toBeGreaterThan(1400)
    expect(finding!.details.threshold_meters).toBe(150)
    expect(finding!.details.separated_for_seconds).toBe(61)
  })

  it('does not fire at exactly the grace boundary', () => {
    const separatedSince = NOW - DEVIATION_GRACE_SECONDS * 1000
    const res = evaluate({
      ...base,
      driver: fix(HITEC),
      customer: fix(FAR),
      state: { separatedSince },
    })
    expect(res.findings.map((f) => f.reason)).not.toContain('ROUTE_DEVIATION_EXCEEDED')
  })

  it('clears the deviation clock as soon as the devices are together again', () => {
    const separatedSince = NOW - 90_000
    const res = evaluate({
      ...base,
      driver: fix(HITEC),
      customer: fix(NEAR),
      state: { separatedSince },
    })
    expect(res.state.separatedSince).toBeNull()
    expect(res.verified).toBe(true)
  })

  it('raises SPEED_CEILING_BREACH from the driver stream alone', () => {
    const res = evaluate({
      ...base,
      driver: fix(HITEC, { speedKmh: 88 }),
      customer: null,
      speedCeilingKmh: 70,
    })

    const finding = res.findings.find((f) => f.reason === 'SPEED_CEILING_BREACH')
    expect(finding).toBeDefined()
    expect(finding!.details).toMatchObject({ speed_kmh: 88, ceiling_kmh: 70, over_by_kmh: 18 })
  })

  it('does not treat driving exactly at the ceiling as a breach', () => {
    const res = evaluate({
      ...base,
      driver: fix(HITEC, { speedKmh: 60 }),
      customer: fix(NEAR),
    })
    expect(res.findings).toHaveLength(0)
  })

  it('treats a missing customer stream as unevaluable, not as a deviation', () => {
    // A passenger with a dead phone must not be reported as an abduction.
    const res = evaluate({ ...base, driver: fix(HITEC), customer: null })

    expect(res.verified).toBe(false)
    expect(res.separationMeters).toBeNull()
    expect(res.findings.map((f) => f.reason)).not.toContain('ROUTE_DEVIATION_EXCEEDED')
  })

  it('ignores a stale fix', () => {
    const stale = fix(FAR, { at: NOW - 60_000 })
    const res = evaluate({ ...base, driver: fix(HITEC), customer: stale })

    expect(res.separationMeters).toBeNull()
    expect(res.state.separatedSince).toBeNull()
  })

  it('can raise a speed breach and a deviation together', () => {
    const res = evaluate({
      ...base,
      driver: fix(HITEC, { speedKmh: 99 }),
      customer: fix(FAR),
      state: { separatedSince: NOW - 120_000 },
    })
    expect(res.findings.map((f) => f.reason).sort()).toEqual([
      'ROUTE_DEVIATION_EXCEEDED',
      'SPEED_CEILING_BREACH',
    ])
  })

  it('buckets anomalies into stable 60-second windows', () => {
    const a = windowStart(NOW)
    const b = windowStart(NOW + 59_000)
    const c = windowStart(NOW + 61_000)

    expect(a.getTime()).toBe(b.getTime())
    expect(c.getTime()).toBeGreaterThan(a.getTime())
    expect(a.getTime() % 60_000).toBe(0)
  })
})
