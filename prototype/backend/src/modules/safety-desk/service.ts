import { pool } from '../../db/client.js'
import { notFound } from '../../lib/errors.js'
import { getVoiceProvider } from '../../providers/voice/index.js'
import type { Role } from '../auth/otp.js'
import { getEscalation, notifyGuardians } from '../escalation/service.js'
import type { EscalationLevel } from '../escalation/levels.js'

/**
 * admin_crm_spec.md requires every Safety Desk action to be logged immutably —
 * including reads, because opening a live feed or a vault record is itself a
 * privacy-relevant act.
 */
export async function audit(
  actorId: string | null,
  actorRole: Role | null,
  action: string,
  subject: string | null,
  payload: unknown = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_log (actor_id, actor_role, action, subject, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorId, actorRole, action, subject, JSON.stringify(payload)],
  )
}

export type LiveTrip = {
  trip_id: string
  status: string
  customer_name: string | null
  driver_name: string | null
  vehicle_plate: string | null
  speed_ceiling_kmh: number
  started_at: string | null
  escalation_level: EscalationLevel | null
  last_seen: string | null
}

/** The live board: every trip currently under way, worst state first. */
export async function activeTrips(): Promise<LiveTrip[]> {
  const { rows } = await pool.query<LiveTrip>(
    `SELECT t.id AS trip_id,
            t.status,
            cu.full_name AS customer_name,
            du.full_name AS driver_name,
            dp.vehicle_plate,
            t.speed_ceiling_kmh,
            t.started_at,
            e.level AS escalation_level,
            NULL::text AS last_seen
       FROM trips t
       JOIN users cu ON cu.id = t.customer_id
       LEFT JOIN users du ON du.id = t.driver_id
       LEFT JOIN driver_profiles dp ON dp.user_id = t.driver_id
       LEFT JOIN escalations e ON e.trip_id = t.id AND e.status <> 'RESOLVED'
      WHERE t.status IN ('HANDSHAKE_PENDING', 'IN_TRIP', 'ESCALATED')
      ORDER BY e.level DESC NULLS LAST, t.started_at ASC NULLS LAST
      LIMIT 500`,
  )
  return rows
}

export type QueueItem = {
  id: string
  trip_id: string
  level: EscalationLevel
  status: string
  reason: string
  opened_at: string
  sla_deadline: string | null
  sla_seconds_remaining: number | null
  sla_breached: boolean
  assigned_agent_id: string | null
  customer_name: string | null
  driver_name: string | null
}

/**
 * The escalation queue, auto-prioritised: highest level first, then the one
 * closest to breaching its contact SLA.
 */
export async function escalationQueue(includeResolved = false): Promise<QueueItem[]> {
  const { rows } = await pool.query<QueueItem>(
    `SELECT e.id, e.trip_id, e.level, e.status, e.reason, e.opened_at, e.sla_deadline,
            CASE WHEN e.sla_deadline IS NULL THEN NULL
                 ELSE EXTRACT(EPOCH FROM (e.sla_deadline - now()))::int END
              AS sla_seconds_remaining,
            (e.sla_deadline IS NOT NULL AND e.sla_deadline < now() AND e.status = 'OPEN')
              AS sla_breached,
            e.assigned_agent_id,
            cu.full_name AS customer_name,
            du.full_name AS driver_name
       FROM escalations e
       JOIN trips t ON t.id = e.trip_id
       JOIN users cu ON cu.id = t.customer_id
       LEFT JOIN users du ON du.id = t.driver_id
      WHERE ($1::boolean OR e.status <> 'RESOLVED')
      ORDER BY e.level DESC, e.sla_deadline ASC NULLS LAST, e.opened_at ASC
      LIMIT 200`,
    [includeResolved],
  )
  return rows
}

type Party = 'DRIVER' | 'CUSTOMER'

/** One-click IVR to either party on an incident. */
export async function callParty(
  escalationId: string,
  party: Party,
  agentId: string,
  role: Role,
): Promise<{ sid: string; status: string; to_masked: string }> {
  const escalation = await getEscalation(escalationId)

  const column = party === 'DRIVER' ? 'driver_id' : 'customer_id'
  const { rows } = await pool.query<{ phone_number: string | null }>(
    `SELECT u.phone_number FROM trips t JOIN users u ON u.id = t.${column} WHERE t.id = $1`,
    [escalation.trip_id],
  )
  const phone = rows[0]?.phone_number
  if (!phone) throw notFound('NO_PHONE_NUMBER', `That trip's ${party.toLowerCase()} has no number`)

  const result = await getVoiceProvider().call(
    phone,
    'This is the MyDriver Safety Desk. We have detected an issue with your current trip. Please respond to our agent.',
  )

  await pool.query(
    `INSERT INTO escalation_events (escalation_id, type, actor_id, actor_role, payload)
     VALUES ($1, 'IVR_CALL_PLACED', $2, $3, $4::jsonb)`,
    [escalationId, agentId, role, JSON.stringify({ party, sid: result.sid })],
  )
  await audit(agentId, role, 'IVR_CALL', escalation.trip_id, { party, escalation_id: escalationId })

  // Never echo a full number back to the console; the agent does not need it.
  return { ...result, to_masked: `${phone.slice(0, 3)}••••${phone.slice(-3)}` }
}

export async function dispatchGuardians(
  escalationId: string,
  agentId: string,
  role: Role,
): Promise<{ notified: number }> {
  const escalation = await getEscalation(escalationId)
  const notified = await notifyGuardians(escalation)
  await audit(agentId, role, 'GUARDIAN_DISPATCH', escalation.trip_id, {
    escalation_id: escalationId,
    notified,
  })
  return { notified }
}

/**
 * L5 evidence release.
 *
 * The packet is assembled from what Phase 1 already records: the immutable trip
 * ledger and the telemetry track. The 8-point inspection photos and the signed
 * certificate belong to the Trip Vault (Phase 3) and are listed as pending
 * rather than silently omitted.
 */
export async function releaseEvidence(
  escalationId: string,
  agentId: string,
  role: Role,
  recipient: string,
): Promise<{
  trip_id: string
  released_to: string
  ledger_entries: number
  telemetry_points: number
  pending: string[]
}> {
  const escalation = await getEscalation(escalationId)

  const [{ rows: ledger }, { rows: telemetry }] = await Promise.all([
    pool.query<{ n: string }>(`SELECT count(*) AS n FROM trip_events WHERE trip_id = $1`, [
      escalation.trip_id,
    ]),
    pool.query<{ n: string }>(`SELECT count(*) AS n FROM telematics_logs WHERE trip_id = $1`, [
      escalation.trip_id,
    ]),
  ])

  const packet = {
    trip_id: escalation.trip_id,
    released_to: recipient,
    ledger_entries: Number(ledger[0]!.n),
    telemetry_points: Number(telemetry[0]!.n),
    pending: ['inspection_photos', 'signed_certificate'],
  }

  await pool.query(
    `INSERT INTO escalation_events (escalation_id, type, actor_id, actor_role, payload)
     VALUES ($1, 'EVIDENCE_RELEASED', $2, $3, $4::jsonb)`,
    [escalationId, agentId, role, JSON.stringify(packet)],
  )
  await audit(agentId, role, 'EVIDENCE_RELEASE', escalation.trip_id, packet)

  return packet
}

export async function deskStats(): Promise<{
  active_trips: number
  open_escalations: number
  sla_breached: number
  by_level: Record<string, number>
}> {
  const [{ rows: trips }, { rows: open }, { rows: breached }, { rows: levels }] = await Promise.all([
    pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM trips WHERE status IN ('HANDSHAKE_PENDING','IN_TRIP','ESCALATED')`,
    ),
    pool.query<{ n: string }>(`SELECT count(*) AS n FROM escalations WHERE status <> 'RESOLVED'`),
    pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM escalations
        WHERE status = 'OPEN' AND sla_deadline IS NOT NULL AND sla_deadline < now()`,
    ),
    pool.query<{ level: string; n: string }>(
      `SELECT level, count(*) AS n FROM escalations WHERE status <> 'RESOLVED' GROUP BY level`,
    ),
  ])

  return {
    active_trips: Number(trips[0]!.n),
    open_escalations: Number(open[0]!.n),
    sla_breached: Number(breached[0]!.n),
    by_level: Object.fromEntries(levels.map((r) => [r.level, Number(r.n)])),
  }
}
