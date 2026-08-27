import { pool } from '../../db/client.js'
import { counter } from '../../lib/metrics.js'
import { redis } from '../../redis/client.js'
import { claimAnomaly, raiseEscalation, recordAnomaly } from '../escalation/service.js'
import {
  ANOMALY_WINDOW_SECONDS,
  EVALUATION_INTERVAL_MS,
  evaluate,
  windowStart,
  type Fix,
  type IntegrityState,
} from './evaluator.js'

/**
 * The dual-GPS integrity engine.
 *
 * Every instance runs one of these and evaluates every trip it holds telemetry
 * for. Two instances seeing the same trip will both reach the same conclusion —
 * which is deliberate: no leader election, no single point of failure on the
 * safety path. Duplicate incidents are prevented at the moment of raising, by an
 * atomic Redis claim with the unique index on `anomalies` as the backstop.
 *
 * Positions are read from the same Redis keys the gateway already writes, so
 * this adds no work to the ingest path.
 */
export class IntegrityEngine {
  private timer: NodeJS.Timeout | undefined
  private readonly state = new Map<string, IntegrityState>()
  private evaluating = false

  private evaluations = 0
  private findings = 0

  get evaluationCount(): number {
    return this.evaluations
  }
  get findingCount(): number {
    return this.findings
  }
  get trackedTrips(): number {
    return this.state.size
  }

  start(intervalMs = EVALUATION_INTERVAL_MS): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.tick().catch((err) => console.error('integrity tick failed', err))
    }, intervalMs)
    this.timer.unref()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    this.state.clear()
  }

  /** One evaluation pass over every active trip. */
  async tick(): Promise<number> {
    // Overlapping passes would double-count the deviation timer.
    if (this.evaluating) return 0
    this.evaluating = true

    try {
      const { rows } = await pool.query<{ id: string; speed_ceiling_kmh: number }>(
        `SELECT id, speed_ceiling_kmh FROM trips
          WHERE status IN ('IN_TRIP', 'ESCALATED')`,
      )

      // Trips that ended must not keep their deviation timers alive.
      const active = new Set(rows.map((r) => r.id))
      for (const tripId of this.state.keys()) {
        if (!active.has(tripId)) this.state.delete(tripId)
      }

      let raised = 0
      for (const trip of rows) {
        raised += await this.evaluateTrip(trip.id, trip.speed_ceiling_kmh)
      }
      return raised
    } finally {
      this.evaluating = false
    }
  }

  private async readFix(tripId: string, source: 'driver' | 'customer'): Promise<Fix | null> {
    const raw = await redis.get(`trip:{${tripId}}:last:${source}`)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as { lat: number; lng: number; speed?: number; at: number }
      return {
        coords: { lat: parsed.lat, lng: parsed.lng },
        speedKmh: parsed.speed,
        at: parsed.at,
      }
    } catch {
      return null
    }
  }

  async evaluateTrip(tripId: string, speedCeilingKmh: number): Promise<number> {
    const [driver, customer] = await Promise.all([
      this.readFix(tripId, 'driver'),
      this.readFix(tripId, 'customer'),
    ])

    const now = Date.now()
    const result = evaluate({
      driver,
      customer,
      speedCeilingKmh,
      state: this.state.get(tripId) ?? { separatedSince: null },
      now,
    })

    this.state.set(tripId, result.state)
    this.evaluations++
    counter('mydriver_integrity_evaluations_total')

    if (result.findings.length === 0) return 0

    let raised = 0
    for (const finding of result.findings) {
      // Whichever instance wins the claim raises it; the others move on.
      if (!(await claimAnomaly(tripId, finding.reason, ANOMALY_WINDOW_SECONDS))) continue

      const inserted = await recordAnomaly({
        tripId,
        reason: finding.reason,
        level: 'L1',
        windowStart: windowStart(now),
        details: finding.details,
      })
      if (!inserted) continue // The backstop caught a race the claim missed.

      await raiseEscalation({
        tripId,
        level: 'L1',
        reason: finding.reason,
        details: finding.details,
      })

      this.findings++
      raised++
      counter('mydriver_anomalies_raised_total')
    }
    return raised
  }
}

let engine: IntegrityEngine | undefined

export function getIntegrityEngine(): IntegrityEngine {
  if (!engine) engine = new IntegrityEngine()
  return engine
}
