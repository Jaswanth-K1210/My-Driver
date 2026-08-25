import { describe, expect, it } from 'vitest'
import {
  assertTransition,
  canTransition,
  isTerminal,
  type TripStatus,
} from '../../src/modules/trips/state-machine.js'

describe('trip state machine', () => {
  it('allows the happy path in order', () => {
    expect(canTransition('REQUESTED', 'MATCHED')).toBe(true)
    expect(canTransition('MATCHED', 'HANDSHAKE_PENDING')).toBe(true)
    expect(canTransition('HANDSHAKE_PENDING', 'IN_TRIP')).toBe(true)
    expect(canTransition('IN_TRIP', 'COMPLETED')).toBe(true)
  })

  it('forbids skipping the handshake', () => {
    expect(canTransition('MATCHED', 'IN_TRIP')).toBe(false)
    expect(canTransition('REQUESTED', 'IN_TRIP')).toBe(false)
  })

  it('forbids going backwards', () => {
    expect(canTransition('IN_TRIP', 'MATCHED')).toBe(false)
    expect(canTransition('COMPLETED', 'IN_TRIP')).toBe(false)
  })

  it('allows cancellation before the trip starts, never after', () => {
    expect(canTransition('REQUESTED', 'CANCELLED')).toBe(true)
    expect(canTransition('MATCHED', 'CANCELLED')).toBe(true)
    expect(canTransition('HANDSHAKE_PENDING', 'CANCELLED')).toBe(true)
    expect(canTransition('IN_TRIP', 'CANCELLED')).toBe(false)
    expect(canTransition('COMPLETED', 'CANCELLED')).toBe(false)
  })

  it('allows an unmatched request to end as NO_DRIVERS_FOUND', () => {
    expect(canTransition('REQUESTED', 'NO_DRIVERS_FOUND')).toBe(true)
    expect(canTransition('MATCHED', 'NO_DRIVERS_FOUND')).toBe(false)
  })

  it('allows a matched trip to fall back to REQUESTED when an offer is declined', () => {
    expect(canTransition('MATCHED', 'REQUESTED')).toBe(true)
  })

  it('reserves ESCALATED for an in-progress trip (Phase 2)', () => {
    expect(canTransition('IN_TRIP', 'ESCALATED')).toBe(true)
    expect(canTransition('REQUESTED', 'ESCALATED')).toBe(false)
  })

  it('treats terminal states as terminal', () => {
    for (const s of ['COMPLETED', 'CANCELLED', 'NO_DRIVERS_FOUND'] as TripStatus[]) {
      expect(isTerminal(s)).toBe(true)
    }
    expect(isTerminal('IN_TRIP')).toBe(false)
  })

  it('never allows a transition out of a terminal state', () => {
    const all: TripStatus[] = [
      'REQUESTED', 'MATCHED', 'HANDSHAKE_PENDING', 'IN_TRIP',
      'COMPLETED', 'CANCELLED', 'NO_DRIVERS_FOUND', 'ESCALATED',
    ]
    for (const to of all) {
      expect(canTransition('COMPLETED', to)).toBe(false)
      expect(canTransition('CANCELLED', to)).toBe(false)
      expect(canTransition('NO_DRIVERS_FOUND', to)).toBe(false)
    }
  })

  it('assertTransition throws a typed 409 on an illegal move', () => {
    try {
      assertTransition('REQUESTED', 'COMPLETED')
      expect.unreachable('should have thrown')
    } catch (err) {
      expect((err as { code: string }).code).toBe('INVALID_TRIP_TRANSITION')
      expect((err as { statusCode: number }).statusCode).toBe(409)
    }
  })

  it('assertTransition is silent on a legal move', () => {
    expect(() => assertTransition('REQUESTED', 'MATCHED')).not.toThrow()
  })
})
