import { pool } from '../../db/client.js'
import { counter } from '../../lib/metrics.js'
import { AUTO_PROMOTE_AFTER_SECONDS, nextLevelOnTimeout, type EscalationLevel } from './levels.js'
import { raiseEscalation } from './service.js'

/**
 * Promotes stale incidents.
 *
 * An L1 anomaly nobody acknowledges within 120 seconds becomes L2, which puts
 * it in the Safety Desk queue and starts the sub-3-minute contact SLA. Without
 * this the documented SLA would be meaningless: nothing would ever reach L2.
 *
 * SKIP LOCKED so every instance can run the loop concurrently.
 */
export async function promoteStaleEscalations(): Promise<number> {
  const client = await pool.connect()
  let candidates: Array<{ id: string; trip_id: string; level: EscalationLevel }> = []

  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{ id: string; trip_id: string; level: EscalationLevel }>(
      `SELECT id, trip_id, level
         FROM escalations
        WHERE status = 'OPEN'
          AND level = 'L1'
          AND opened_at <= now() - ($1 || ' seconds')::interval
        ORDER BY opened_at
        LIMIT 100
        FOR UPDATE SKIP LOCKED`,
      [String(AUTO_PROMOTE_AFTER_SECONDS)],
    )
    candidates = rows
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  let promoted = 0
  for (const row of candidates) {
    const next = nextLevelOnTimeout(row.level)
    if (!next) continue
    await raiseEscalation({
      tripId: row.trip_id,
      level: next,
      reason: 'UNACKNOWLEDGED_ANOMALY',
      details: { promoted_from: row.level, after_seconds: AUTO_PROMOTE_AFTER_SECONDS },
    }).catch(() => undefined)
    promoted++
    counter('mydriver_escalation_auto_promoted_total')
  }
  return promoted
}

/** Counts incidents whose contact SLA has already passed unacknowledged. */
export async function breachedSlaCount(): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM escalations
      WHERE status = 'OPEN' AND sla_deadline IS NOT NULL AND sla_deadline < now()`,
  )
  return Number(rows[0]?.n ?? 0)
}

export function startEscalationSweeper(intervalMs = 10_000): () => void {
  const timer = setInterval(() => {
    void promoteStaleEscalations().catch((err) => console.error('escalation sweeper failed', err))
  }, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}
