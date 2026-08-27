import { describe, expect, it } from 'vitest'
import { INSPECTION_ZONES, isComplete, missingZones, ZONE_LABEL } from '../../src/modules/vault/zones.js'

describe('8-point inspection zones', () => {
  it('is exactly the eight documented points', () => {
    expect(INSPECTION_ZONES).toHaveLength(8)
    expect([...INSPECTION_ZONES]).toEqual([
      'FRONT', 'REAR', 'LEFT', 'RIGHT', 'DASHBOARD', 'SEATS', 'FUEL_ODOMETER', 'BOOT',
    ])
  })

  it('labels every zone', () => {
    for (const zone of INSPECTION_ZONES) {
      expect(ZONE_LABEL[zone]).toBeTruthy()
    }
  })

  it('reports what is still outstanding', () => {
    expect(missingZones([])).toHaveLength(8)
    expect(missingZones(['FRONT', 'REAR'])).toHaveLength(6)
    expect(missingZones([...INSPECTION_ZONES])).toHaveLength(0)
  })

  it('is complete only when all eight are captured', () => {
    expect(isComplete([])).toBe(false)
    expect(isComplete(INSPECTION_ZONES.slice(0, 7))).toBe(false)
    expect(isComplete([...INSPECTION_ZONES])).toBe(true)
  })

  it('ignores unknown zones rather than counting them toward completion', () => {
    expect(isComplete(['FRONT', 'ROOF', 'ENGINE'])).toBe(false)
  })
})
