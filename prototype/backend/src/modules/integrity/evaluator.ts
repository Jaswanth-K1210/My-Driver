import { haversineMeters, type LatLng } from '../../lib/geo.js'

/**
 * Dual-GPS integrity rules, as pure functions.
 *
 * From system_architecture.md: the driver and customer streams are compared
 * every 3 seconds. Within 150 m is VERIFIED; beyond 150 m for more than 60
 * seconds raises an L1 anomaly.
 */
export const EVALUATION_INTERVAL_MS = 3_000
export const CO_LOCATION_THRESHOLD_M = 150
export const DEVIATION_GRACE_SECONDS = 60

export type IntegrityReason =
  | 'ROUTE_DEVIATION_EXCEEDED'
  | 'SPEED_CEILING_BREACH'
  | 'TELEMETRY_LOST'

export type Fix = { coords: LatLng; speedKmh?: number | undefined; at: number }

export type IntegrityState = {
  /** When the two devices first went further apart than the threshold. */
  separatedSince: number | null
}

export type IntegrityFinding = {
  reason: IntegrityReason
  details: Record<string, unknown>
}

export type EvaluationInput = {
  driver: Fix | null
  customer: Fix | null
  speedCeilingKmh: number
  state: IntegrityState
  now: number
}

export type EvaluationResult = {
  state: IntegrityState
  findings: IntegrityFinding[]
  /** Distance between the two devices, when both are known. */
  separationMeters: number | null
  verified: boolean
}

/** How stale a fix may be before it stops counting as a live position. */
export const FIX_STALE_AFTER_MS = 30_000

export function evaluate(input: EvaluationInput): EvaluationResult {
  const { driver, customer, speedCeilingKmh, now } = input
  const findings: IntegrityFinding[] = []
  let state = { ...input.state }

  // Speed is judged from the driver's own stream and needs no second party,
  // so it is checked before the co-location rules.
  if (driver && driver.speedKmh != null && driver.speedKmh > speedCeilingKmh) {
    findings.push({
      reason: 'SPEED_CEILING_BREACH',
      details: {
        speed_kmh: Math.round(driver.speedKmh),
        ceiling_kmh: speedCeilingKmh,
        over_by_kmh: Math.round(driver.speedKmh - speedCeilingKmh),
      },
    })
  }

  const driverFresh = driver != null && now - driver.at <= FIX_STALE_AFTER_MS
  const customerFresh = customer != null && now - customer.at <= FIX_STALE_AFTER_MS

  // Co-location needs both streams. A missing customer stream is not a
  // deviation — the passenger may simply have a dead phone — so separation is
  // left unevaluated rather than assumed bad.
  if (!driverFresh || !customerFresh) {
    return { state: { separatedSince: null }, findings, separationMeters: null, verified: false }
  }

  const separationMeters = haversineMeters(driver!.coords, customer!.coords)

  if (separationMeters <= CO_LOCATION_THRESHOLD_M) {
    return { state: { separatedSince: null }, findings, separationMeters, verified: true }
  }

  const separatedSince = state.separatedSince ?? now
  state = { separatedSince }

  const separatedForSeconds = (now - separatedSince) / 1000
  if (separatedForSeconds > DEVIATION_GRACE_SECONDS) {
    findings.push({
      reason: 'ROUTE_DEVIATION_EXCEEDED',
      details: {
        deviation_distance_meters: Math.round(separationMeters),
        threshold_meters: CO_LOCATION_THRESHOLD_M,
        separated_for_seconds: Math.round(separatedForSeconds),
      },
    })
  }

  return { state, findings, separationMeters, verified: false }
}

/**
 * Anomalies are keyed to a coarse time window so that repeated detections of
 * the same condition collapse into one incident rather than a flood.
 */
export const ANOMALY_WINDOW_SECONDS = 60

export const windowStart = (now: number): Date =>
  new Date(Math.floor(now / (ANOMALY_WINDOW_SECONDS * 1000)) * ANOMALY_WINDOW_SECONDS * 1000)
