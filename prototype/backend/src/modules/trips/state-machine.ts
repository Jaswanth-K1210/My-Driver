import { conflict } from '../../lib/errors.js'

export type TripStatus =
  | 'REQUESTED'
  | 'MATCHED'
  | 'HANDSHAKE_PENDING'
  | 'IN_TRIP'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_DRIVERS_FOUND'
  | 'ESCALATED'

/**
 * The single authority on legal moves. Every guarded transition in the trips
 * service calls assertTransition before writing.
 */
const TRANSITIONS: Record<TripStatus, readonly TripStatus[]> = {
  REQUESTED: ['MATCHED', 'CANCELLED', 'NO_DRIVERS_FOUND'],
  // A declined or expired offer returns the trip to the dispatch pool.
  MATCHED: ['HANDSHAKE_PENDING', 'REQUESTED', 'CANCELLED'],
  HANDSHAKE_PENDING: ['IN_TRIP', 'CANCELLED'],
  IN_TRIP: ['COMPLETED', 'ESCALATED'],
  ESCALATED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_DRIVERS_FOUND: [],
}

export const CANCELLABLE_FROM: readonly TripStatus[] = [
  'REQUESTED',
  'MATCHED',
  'HANDSHAKE_PENDING',
]

/**
 * Location is accepted from the handshake until the trip ends. ESCALATED is
 * included on purpose: an open incident (silent SOS, L3+) is exactly when the
 * Safety Desk and the integrity engine need the car's position most.
 */
const TELEMETRY_FROM: readonly string[] = ['HANDSHAKE_PENDING', 'IN_TRIP', 'ESCALATED']

export const acceptsTelemetry = (status: string): boolean => TELEMETRY_FROM.includes(status)

export const canTransition = (from: TripStatus, to: TripStatus): boolean =>
  TRANSITIONS[from].includes(to)

export const isTerminal = (status: TripStatus): boolean => TRANSITIONS[status].length === 0

export function assertTransition(from: TripStatus, to: TripStatus): void {
  if (!canTransition(from, to)) {
    throw conflict('INVALID_TRIP_TRANSITION', `A trip cannot move from ${from} to ${to}`, {
      from,
      to,
    })
  }
}
