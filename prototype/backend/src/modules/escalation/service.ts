import type { PoolClient } from 'pg'
import { pool } from '../../db/client.js'
import { conflict, notFound } from '../../lib/errors.js'
import { counter } from '../../lib/metrics.js'
import { getPushProvider } from '../../providers/push/index.js'
import { getSmsProvider } from '../../providers/sms/index.js'
import { getHub } from '../../realtime/hub.js'
import { redis } from '../../redis/client.js'
import type { Role } from '../auth/otp.js'
import {
  assertPromotion,
  AUTO_PROMOTE_AFTER_SECONDS,
  MARKS_TRIP_ESCALATED,
  NOTIFIES_GUARDIANS,
  rank,
  SLA_SECONDS,
  type EscalationLevel,
} from './levels.js'

export type EscalationStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'

export type Escalation = {
  id: string
  trip_id: string
  level: EscalationLevel
  status: EscalationStatus
  reason: string
  details: Record<string, unknown>
  opened_at: string
  sla_deadline: string | null
  acknowledged_at: string | null
  assigned_agent_id: string | null
  resolved_at: string | null
  resolution: string | null
}

const SELECT = `
  SELECT id, trip_id, level, status, reason, details, opened_at, sla_deadline,
         acknowledged_at, assigned_agent_id, resolved_at, resolution
    FROM escalations
`

async function recordEvent(
  client: PoolClient,
  escalationId: string,
  type: string,
  actorId: string | null,
  actorRole: Role | null,
  payload: unknown = {},
): Promise<void> {
  await client.query(
    `INSERT INTO escalation_events (escalation_id, type, actor_id, actor_role, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [escalationId, type, actorId, actorRole, JSON.stringify(payload)],
  )
}

/** L2 and above carry the documented sub-3-minute contact SLA. */
const slaFor = (level: EscalationLevel): Date | null =>
  rank(level) >= rank('L2') ? new Date(Date.now() + SLA_SECONDS * 1000) : null

/**
 * Opens an incident, or promotes the trip's existing live one.
 *
 * A trip has at most one live escalation (enforced by a partial unique index):
 * a second anomaly on the same ride is more evidence about one situation, not a
 * competing incident.
 */
export async function raiseEscalation(input: {
  tripId: string
  level: EscalationLevel
  reason: string
  details?: Record<string, unknown>
  actorId?: string | null
  actorRole?: Role | null
}): Promise<{ escalation: Escalation; created: boolean }> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const existing = await client.query<Escalation>(
      `${SELECT} WHERE trip_id = $1 AND status <> 'RESOLVED' FOR UPDATE`,
      [input.tripId],
    )
    const live = existing.rows[0]

    let escalation: Escalation
    let created: boolean

    if (!live) {
      const { rows } = await client.query<Escalation>(
        `INSERT INTO escalations (trip_id, level, reason, details, sla_deadline)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         RETURNING id, trip_id, level, status, reason, details, opened_at, sla_deadline,
                   acknowledged_at, assigned_agent_id, resolved_at, resolution`,
        [
          input.tripId,
          input.level,
          input.reason,
          JSON.stringify(input.details ?? {}),
          slaFor(input.level),
        ],
      )
      escalation = rows[0]!
      created = true
      await recordEvent(client, escalation.id, 'OPENED', input.actorId ?? null,
        input.actorRole ?? null, { level: input.level, reason: input.reason, ...input.details })
    } else if (rank(input.level) > rank(live.level)) {
      const { rows } = await client.query<Escalation>(
        `UPDATE escalations
            SET level = $2,
                reason = $3,
                details = details || $4::jsonb,
                sla_deadline = COALESCE(sla_deadline, $5),
                status = CASE WHEN status = 'RESOLVED' THEN status ELSE 'OPEN' END,
                updated_at = now()
          WHERE id = $1
          RETURNING id, trip_id, level, status, reason, details, opened_at, sla_deadline,
                    acknowledged_at, assigned_agent_id, resolved_at, resolution`,
        [live.id, input.level, input.reason, JSON.stringify(input.details ?? {}), slaFor(input.level)],
      )
      escalation = rows[0]!
      created = false
      await recordEvent(client, escalation.id, 'PROMOTED', input.actorId ?? null,
        input.actorRole ?? null, { from: live.level, to: input.level, reason: input.reason })
    } else {
      // Same or lower severity: attach the evidence, leave the level alone.
      const { rows } = await client.query<Escalation>(
        `UPDATE escalations SET details = details || $2::jsonb, updated_at = now()
          WHERE id = $1
          RETURNING id, trip_id, level, status, reason, details, opened_at, sla_deadline,
                    acknowledged_at, assigned_agent_id, resolved_at, resolution`,
        [live.id, JSON.stringify(input.details ?? {})],
      )
      escalation = rows[0]!
      created = false
      await recordEvent(client, escalation.id, 'CORROBORATED', input.actorId ?? null,
        input.actorRole ?? null, { reason: input.reason, ...input.details })
    }

    // L3 and above mark the ride itself as escalated, so every consumer of trip
    // state sees it without having to join the escalation table.
    if (MARKS_TRIP_ESCALATED.includes(escalation.level)) {
      await client.query(
        `UPDATE trips SET status = 'ESCALATED' WHERE id = $1 AND status = 'IN_TRIP'`,
        [input.tripId],
      )
    }

    await client.query('COMMIT')
    counter(`mydriver_escalation_${escalation.level.toLowerCase()}_total`)

    // Side effects run after commit: an SMS cannot be rolled back.
    await announce(escalation).catch(() => undefined)
    if (NOTIFIES_GUARDIANS.includes(escalation.level)) {
      await notifyGuardians(escalation).catch(() => undefined)
    }

    return { escalation, created }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/** Pushes the anomaly to everyone watching the trip. */
async function announce(escalation: Escalation): Promise<void> {
  await getHub().publish(escalation.trip_id, {
    type: 'ANOMALY_TRIGGERED',
    trip_id: escalation.trip_id,
    level: escalation.level,
    reason: escalation.reason,
    ...(typeof escalation.details?.deviation_distance_meters === 'number'
      ? { deviation_distance_meters: escalation.details.deviation_distance_meters }
      : {}),
  })
}

export async function notifyGuardians(escalation: Escalation): Promise<number> {
  const { rows } = await pool.query<{ name: string; phone: string }>(
    `SELECT g.name, g.phone
       FROM guardian_contacts g
       JOIN trips t ON t.customer_id = g.user_id
      WHERE t.id = $1
      ORDER BY g.position`,
    [escalation.trip_id],
  )
  if (rows.length === 0) return 0

  const sms = getSmsProvider()
  const body =
    escalation.level === 'L4' || escalation.level === 'L5'
      ? `MyDriver EMERGENCY: an alert was raised on a trip you are following. Our Safety Desk is responding. Ref ${escalation.id.slice(0, 8)}.`
      : `MyDriver alert: ${escalation.reason.replace(/_/g, ' ').toLowerCase()} on a trip you are following. Ref ${escalation.id.slice(0, 8)}.`

  for (const guardian of rows) {
    await sms.send(guardian.phone, body).catch(() => undefined)
  }

  await pool.query(
    `INSERT INTO escalation_events (escalation_id, type, payload)
     VALUES ($1, 'GUARDIANS_NOTIFIED', $2::jsonb)`,
    [escalation.id, JSON.stringify({ count: rows.length })],
  )
  counter('mydriver_guardian_notifications_total', rows.length)
  return rows.length
}

/**
 * Redis claim that keeps duplicate anomalies from N instances collapsing into
 * N incidents. The unique index on `anomalies` is the backstop if this is lost.
 */
export async function claimAnomaly(
  tripId: string,
  reason: string,
  windowSeconds: number,
): Promise<boolean> {
  const won = await redis.set(
    `anomaly:{${tripId}}:${reason}`,
    '1',
    'EX',
    windowSeconds,
    'NX',
  )
  return won !== null
}

export async function recordAnomaly(input: {
  tripId: string
  reason: string
  level: EscalationLevel
  windowStart: Date
  details: Record<string, unknown>
}): Promise<boolean> {
  const { rowCount } = await pool.query(
    `INSERT INTO anomalies (trip_id, reason, level, window_start, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (trip_id, reason, window_start) DO NOTHING`,
    [input.tripId, input.reason, input.level, input.windowStart, JSON.stringify(input.details)],
  )
  return (rowCount ?? 0) > 0
}

/* ── Agent actions ─────────────────────────────────────────────────────── */

export async function acknowledgeEscalation(
  id: string,
  agentId: string,
  role: Role,
): Promise<Escalation> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<Escalation>(
      `UPDATE escalations
          SET status = 'ACKNOWLEDGED', acknowledged_at = now(), acknowledged_by = $2,
              assigned_agent_id = COALESCE(assigned_agent_id, $2), updated_at = now()
        WHERE id = $1 AND status = 'OPEN'
        RETURNING id, trip_id, level, status, reason, details, opened_at, sla_deadline,
                  acknowledged_at, assigned_agent_id, resolved_at, resolution`,
      [id, agentId],
    )
    const escalation = rows[0]
    if (!escalation) {
      throw conflict('ESCALATION_NOT_OPEN', 'That incident is not open for acknowledgement')
    }
    await recordEvent(client, id, 'ACKNOWLEDGED', agentId, role, {})
    await client.query('COMMIT')

    // Met or missed, the SLA outcome is recorded at the moment of contact.
    const met = escalation.sla_deadline
      ? new Date(escalation.acknowledged_at!) <= new Date(escalation.sla_deadline)
      : true
    counter(met ? 'mydriver_sla_met_total' : 'mydriver_sla_missed_total')

    return escalation
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function promoteEscalation(
  id: string,
  to: EscalationLevel,
  agentId: string,
  role: Role,
  note?: string,
): Promise<Escalation> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const current = await client.query<Escalation>(`${SELECT} WHERE id = $1 FOR UPDATE`, [id])
    const live = current.rows[0]
    if (!live) throw notFound('ESCALATION_NOT_FOUND', 'No such incident')
    assertPromotion(live.level, to)

    const { rows } = await client.query<Escalation>(
      `UPDATE escalations
          SET level = $2, sla_deadline = COALESCE(sla_deadline, $3), updated_at = now()
        WHERE id = $1
        RETURNING id, trip_id, level, status, reason, details, opened_at, sla_deadline,
                  acknowledged_at, assigned_agent_id, resolved_at, resolution`,
      [id, to, slaFor(to)],
    )
    const escalation = rows[0]!
    await recordEvent(client, id, 'PROMOTED', agentId, role, { from: live.level, to, note })

    if (MARKS_TRIP_ESCALATED.includes(to)) {
      await client.query(
        `UPDATE trips SET status = 'ESCALATED' WHERE id = $1 AND status = 'IN_TRIP'`,
        [escalation.trip_id],
      )
    }
    await client.query('COMMIT')

    await announce(escalation).catch(() => undefined)
    await notifyGuardians(escalation).catch(() => undefined)
    return escalation
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function resolveEscalation(
  id: string,
  agentId: string,
  role: Role,
  resolution: string,
): Promise<Escalation> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<Escalation>(
      `UPDATE escalations
          SET status = 'RESOLVED', resolved_at = now(), resolved_by = $2,
              resolution = $3, updated_at = now()
        WHERE id = $1 AND status <> 'RESOLVED'
        RETURNING id, trip_id, level, status, reason, details, opened_at, sla_deadline,
                  acknowledged_at, assigned_agent_id, resolved_at, resolution`,
      [id, agentId, resolution],
    )
    const escalation = rows[0]
    if (!escalation) throw conflict('ESCALATION_ALREADY_RESOLVED', 'That incident is already resolved')

    await recordEvent(client, id, 'RESOLVED', agentId, role, { resolution })

    // A resolved incident releases the trip back to IN_TRIP if it is still running.
    await client.query(
      `UPDATE trips SET status = 'IN_TRIP' WHERE id = $1 AND status = 'ESCALATED'`,
      [escalation.trip_id],
    )
    await client.query('COMMIT')
    return escalation
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function getEscalation(id: string): Promise<Escalation> {
  const { rows } = await pool.query<Escalation>(`${SELECT} WHERE id = $1`, [id])
  if (!rows[0]) throw notFound('ESCALATION_NOT_FOUND', 'No such incident')
  return rows[0]
}

export async function listEscalationEvents(id: string) {
  const { rows } = await pool.query(
    `SELECT type, actor_id, actor_role, payload, created_at
       FROM escalation_events WHERE escalation_id = $1 ORDER BY created_at`,
    [id],
  )
  return rows
}

export { AUTO_PROMOTE_AFTER_SECONDS, SLA_SECONDS }
