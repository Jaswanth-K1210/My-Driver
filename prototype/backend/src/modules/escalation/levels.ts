import { conflict } from '../../lib/errors.js'

/**
 * The L0–L5 ladder.
 *
 * The source specs reference L0–L5 repeatedly but never define them. This is
 * the reading consistent with every concrete mention across the documents:
 * `backend_api_spec.md` raises **L1** for route deviation, `admin_crm_spec.md`
 * shows **L1** for a speed-ceiling breach, **L3** as an active incident with an
 * IVR attempt, and **L4** for silent SOS, with a "<3 minutes from L2 to human
 * agent contact" SLA — which only means anything if L2 is reached automatically.
 */
export type EscalationLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5'

export const LEVEL_ORDER: readonly EscalationLevel[] = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5']

export const LEVEL_MEANING: Record<EscalationLevel, string> = {
  L0: 'Nominal — no action required',
  L1: 'Automated anomaly detected — guardians notified, event logged',
  L2: 'Anomaly unacknowledged — queued to the Safety Desk, SLA clock running',
  L3: 'Human agent engaged — direct contact attempted',
  L4: 'Emergency — silent SOS or confirmed danger',
  L5: 'Law enforcement handoff — evidence packet released',
}

/** L1 is raised automatically and promotes if nobody acknowledges it. */
export const AUTO_PROMOTE_AFTER_SECONDS = 120

/** admin_crm_spec.md: under 3 minutes from L2 to human agent contact. */
export const SLA_SECONDS = 180

export const rank = (level: EscalationLevel): number => LEVEL_ORDER.indexOf(level)

export const isAtLeast = (level: EscalationLevel, floor: EscalationLevel): boolean =>
  rank(level) >= rank(floor)

/**
 * An incident's level may only ever rise. Lowering it would let a mistaken
 * "all clear" bury a real emergency; the way out is to RESOLVE it, which is a
 * deliberate, audited act by a named agent.
 */
export function assertPromotion(from: EscalationLevel, to: EscalationLevel): void {
  if (rank(to) <= rank(from)) {
    throw conflict(
      'INVALID_ESCALATION_PROMOTION',
      `An incident cannot move from ${from} to ${to}; levels only rise`,
      { from, to },
    )
  }
}

/** The level an anomaly opens at, and what a stale one promotes to. */
export const nextLevelOnTimeout = (level: EscalationLevel): EscalationLevel | null =>
  level === 'L1' ? 'L2' : null

/** Levels at which the trip itself is marked ESCALATED. */
export const MARKS_TRIP_ESCALATED: readonly EscalationLevel[] = ['L3', 'L4', 'L5']

/** Levels that notify the customer's guardian contacts. */
export const NOTIFIES_GUARDIANS: readonly EscalationLevel[] = ['L1', 'L2', 'L3', 'L4', 'L5']
