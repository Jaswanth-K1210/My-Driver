import { describe, expect, it } from 'vitest'
import {
  AUTO_PROMOTE_AFTER_SECONDS,
  assertPromotion,
  isAtLeast,
  LEVEL_ORDER,
  MARKS_TRIP_ESCALATED,
  nextLevelOnTimeout,
  rank,
  SLA_SECONDS,
} from '../../src/modules/escalation/levels.js'

describe('L0–L5 ladder', () => {
  it('orders the levels', () => {
    expect(LEVEL_ORDER).toEqual(['L0', 'L1', 'L2', 'L3', 'L4', 'L5'])
    expect(rank('L0')).toBeLessThan(rank('L5'))
  })

  it('compares severity', () => {
    expect(isAtLeast('L4', 'L2')).toBe(true)
    expect(isAtLeast('L1', 'L2')).toBe(false)
    expect(isAtLeast('L2', 'L2')).toBe(true)
  })

  it('allows a promotion to a higher level', () => {
    expect(() => assertPromotion('L1', 'L2')).not.toThrow()
    expect(() => assertPromotion('L2', 'L5')).not.toThrow()
  })

  it('refuses to lower an incident', () => {
    // Lowering would let a mistaken all-clear bury a real emergency. The way
    // out of an incident is to RESOLVE it, which is named and audited.
    try {
      assertPromotion('L4', 'L2')
      expect.unreachable('should have thrown')
    } catch (err) {
      expect((err as { code: string }).code).toBe('INVALID_ESCALATION_PROMOTION')
      expect((err as { statusCode: number }).statusCode).toBe(409)
    }
  })

  it('refuses a no-op promotion', () => {
    expect(() => assertPromotion('L3', 'L3')).toThrow()
  })

  it('auto-promotes only L1, and only to L2', () => {
    expect(nextLevelOnTimeout('L1')).toBe('L2')
    for (const level of ['L0', 'L2', 'L3', 'L4', 'L5'] as const) {
      expect(nextLevelOnTimeout(level)).toBeNull()
    }
  })

  it('marks the trip escalated from L3 upward', () => {
    expect(MARKS_TRIP_ESCALATED).toEqual(['L3', 'L4', 'L5'])
    expect(MARKS_TRIP_ESCALATED).not.toContain('L1')
  })

  it('keeps the documented SLA and promotion timings', () => {
    // admin_crm_spec.md: under 3 minutes from L2 to human agent contact.
    expect(SLA_SECONDS).toBe(180)
    expect(AUTO_PROMOTE_AFTER_SECONDS).toBe(120)
  })
})
