import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { pool } from '../../db/client.js'
import { forbidden, notFound } from '../../lib/errors.js'
import { DESK_ROLES } from '../auth/roles.js'
import { requireAuth, requireRole } from '../auth/rbac.js'
import {
  acknowledgeEscalation,
  getEscalation,
  listEscalationEvents,
  promoteEscalation,
  raiseEscalation,
  resolveEscalation,
} from '../escalation/service.js'
import { breachedSlaCount } from '../escalation/sweeper.js'
import {
  createGuardianLink,
  resolveGuardianLink,
  revokeGuardianLinks,
  shareGuardianLink,
} from '../guardian/service.js'
import {
  activeTrips,
  audit,
  callParty,
  deskStats,
  dispatchGuardians,
  escalationQueue,
  releaseEvidence,
} from './service.js'

const LevelSchema = z.enum(['L0', 'L1', 'L2', 'L3', 'L4', 'L5'])

const EscalationSchema = z.object({
  id: z.string().uuid(),
  trip_id: z.string().uuid(),
  level: LevelSchema,
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']),
  reason: z.string(),
  details: z.record(z.unknown()),
  opened_at: z.coerce.string(),
  sla_deadline: z.coerce.string().nullable(),
  acknowledged_at: z.coerce.string().nullable(),
  assigned_agent_id: z.string().uuid().nullable(),
  resolved_at: z.coerce.string().nullable(),
  resolution: z.string().nullable(),
})

export function registerSafetyRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>()

  /* ── Customer-facing safety ──────────────────────────────────────────── */

  r.post(
    '/v1/trips/:id/sos',
    {
      onRequest: [requireAuth, requireRole('CUSTOMER', 'DRIVER')],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z
          .object({
            // The silent SOS must look like nothing happened to anyone nearby.
            silent: z.boolean().default(true),
            note: z.string().max(240).optional(),
          })
          .strict(),
        response: { 200: EscalationSchema },
      },
    },
    async (request) => {
      const { rows } = await pool.query(
        `SELECT id FROM trips WHERE id = $1 AND (customer_id = $2 OR driver_id = $2)`,
        [request.params.id, request.auth!.userId],
      )
      if (!rows[0]) throw notFound('TRIP_NOT_FOUND', 'No such trip')

      // Straight to L4. An SOS is never a maybe.
      const { escalation } = await raiseEscalation({
        tripId: request.params.id,
        level: 'L4',
        reason: 'SILENT_SOS',
        details: {
          silent: request.body.silent,
          raised_by_role: request.auth!.role,
          ...(request.body.note ? { note: request.body.note } : {}),
        },
        actorId: request.auth!.userId,
        actorRole: request.auth!.role,
      })
      return escalation
    },
  )

  r.post(
    '/v1/trips/:id/guardian-link',
    {
      onRequest: [requireAuth, requireRole('CUSTOMER')],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ share_by_sms: z.boolean().default(false) }).strict(),
        response: {
          200: z.object({
            url: z.string(),
            expires_at: z.coerce.string(),
            sent_to_guardians: z.number().int(),
          }),
        },
      },
    },
    async (request) => {
      if (request.body.share_by_sms) {
        const { sent, link } = await shareGuardianLink(request.params.id, request.auth!.userId)
        return { url: link.url, expires_at: link.expires_at, sent_to_guardians: sent }
      }
      const link = await createGuardianLink(request.params.id, request.auth!.userId)
      return { url: link.url, expires_at: link.expires_at, sent_to_guardians: 0 }
    },
  )

  r.delete(
    '/v1/trips/:id/guardian-link',
    {
      onRequest: [requireAuth, requireRole('CUSTOMER')],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ revoked: z.number().int() }) },
      },
    },
    async (request) => ({
      revoked: await revokeGuardianLinks(request.params.id, request.auth!.userId),
    }),
  )

  /** Public. No auth: whoever holds the link is the audience. */
  r.get(
    '/v1/track/:token',
    {
      schema: {
        params: z.object({ token: z.string().min(16).max(128) }),
        response: {
          200: z.object({
            trip_id: z.string().uuid(),
            status: z.string(),
            coords: z.object({ lat: z.number(), lng: z.number() }).nullable(),
            speed_kmh: z.number().nullable(),
            speed_ceiling_kmh: z.number().int(),
            over_ceiling: z.boolean(),
            driver_first_name: z.string().nullable(),
            vehicle: z.string().nullable(),
            updated_at: z.coerce.string().nullable(),
          }),
        },
      },
    },
    async (request) => resolveGuardianLink(request.params.token),
  )

  r.post(
    '/v1/me/devices',
    {
      onRequest: [requireAuth],
      schema: {
        body: z
          .object({
            platform: z.enum(['ios', 'android', 'web']),
            token: z.string().min(8).max(512),
          })
          .strict(),
        response: { 201: z.object({ registered: z.boolean() }) },
      },
    },
    async (request, reply) => {
      await pool.query(
        `INSERT INTO device_tokens (user_id, platform, token)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, token) DO UPDATE SET last_seen = now()`,
        [request.auth!.userId, request.body.platform, request.body.token],
      )
      return reply.status(201).send({ registered: true })
    },
  )

  /* ── Safety Desk ─────────────────────────────────────────────────────── */

  r.get(
    '/v1/admin/stats',
    {
      onRequest: [requireAuth, requireRole(...DESK_ROLES)],
      schema: {
        response: {
          200: z.object({
            active_trips: z.number().int(),
            open_escalations: z.number().int(),
            sla_breached: z.number().int(),
            by_level: z.record(z.number()),
          }),
        },
      },
    },
    async () => deskStats(),
  )

  r.get(
    '/v1/admin/trips/active',
    {
      onRequest: [requireAuth, requireRole(...DESK_ROLES)],
      schema: {
        response: {
          200: z.array(
            z.object({
              trip_id: z.string().uuid(),
              status: z.string(),
              customer_name: z.string().nullable(),
              driver_name: z.string().nullable(),
              vehicle_plate: z.string().nullable(),
              speed_ceiling_kmh: z.number().int(),
              started_at: z.coerce.string().nullable(),
              escalation_level: LevelSchema.nullable(),
              last_seen: z.coerce.string().nullable(),
            }),
          ),
        },
      },
    },
    async (request) => {
      // Viewing the live board is itself an audited act.
      await audit(request.auth!.userId, request.auth!.role, 'VIEW_LIVE_BOARD', null)
      return activeTrips()
    },
  )

  r.get(
    '/v1/admin/escalations',
    {
      onRequest: [requireAuth, requireRole(...DESK_ROLES)],
      schema: {
        querystring: z.object({ include_resolved: z.coerce.boolean().default(false) }),
        response: {
          200: z.object({
            sla_breached: z.number().int(),
            items: z.array(
              z.object({
                id: z.string().uuid(),
                trip_id: z.string().uuid(),
                level: LevelSchema,
                status: z.string(),
                reason: z.string(),
                opened_at: z.coerce.string(),
                sla_deadline: z.coerce.string().nullable(),
                sla_seconds_remaining: z.number().int().nullable(),
                sla_breached: z.boolean(),
                assigned_agent_id: z.string().uuid().nullable(),
                customer_name: z.string().nullable(),
                driver_name: z.string().nullable(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => ({
      sla_breached: await breachedSlaCount(),
      items: await escalationQueue(request.query.include_resolved),
    }),
  )

  r.get(
    '/v1/admin/escalations/:id',
    {
      onRequest: [requireAuth, requireRole(...DESK_ROLES)],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            escalation: EscalationSchema,
            events: z.array(
              z.object({
                type: z.string(),
                actor_id: z.string().uuid().nullable(),
                actor_role: z.string().nullable(),
                payload: z.record(z.unknown()),
                created_at: z.coerce.string(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => {
      const escalation = await getEscalation(request.params.id)
      await audit(request.auth!.userId, request.auth!.role, 'VIEW_INCIDENT', escalation.trip_id, {
        escalation_id: escalation.id,
      })
      return { escalation, events: await listEscalationEvents(request.params.id) }
    },
  )

  r.post(
    '/v1/admin/escalations/:id/acknowledge',
    {
      onRequest: [requireAuth, requireRole(...DESK_ROLES)],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: EscalationSchema },
      },
    },
    async (request) =>
      acknowledgeEscalation(request.params.id, request.auth!.userId, request.auth!.role),
  )

  r.post(
    '/v1/admin/escalations/:id/promote',
    {
      onRequest: [requireAuth, requireRole(...DESK_ROLES)],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ level: LevelSchema, note: z.string().max(240).optional() }).strict(),
        response: { 200: EscalationSchema },
      },
    },
    async (request) =>
      promoteEscalation(
        request.params.id,
        request.body.level,
        request.auth!.userId,
        request.auth!.role,
        request.body.note,
      ),
  )

  r.post(
    '/v1/admin/escalations/:id/resolve',
    {
      onRequest: [requireAuth, requireRole(...DESK_ROLES)],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ resolution: z.string().min(1).max(500) }).strict(),
        response: { 200: EscalationSchema },
      },
    },
    async (request) =>
      resolveEscalation(
        request.params.id,
        request.auth!.userId,
        request.auth!.role,
        request.body.resolution,
      ),
  )

  r.post(
    '/v1/admin/escalations/:id/call',
    {
      onRequest: [requireAuth, requireRole(...DESK_ROLES)],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ party: z.enum(['DRIVER', 'CUSTOMER']) }).strict(),
        response: {
          200: z.object({ sid: z.string(), status: z.string(), to_masked: z.string() }),
        },
      },
    },
    async (request) =>
      callParty(request.params.id, request.body.party, request.auth!.userId, request.auth!.role),
  )

  r.post(
    '/v1/admin/escalations/:id/notify-guardians',
    {
      onRequest: [requireAuth, requireRole(...DESK_ROLES)],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ notified: z.number().int() }) },
      },
    },
    async (request) =>
      dispatchGuardians(request.params.id, request.auth!.userId, request.auth!.role),
  )

  r.post(
    '/v1/admin/escalations/:id/release-evidence',
    {
      // Releasing evidence to law enforcement is not a front-line action.
      onRequest: [requireAuth, requireRole('OPS_MANAGER', 'SUPER_ADMIN')],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ recipient: z.string().min(1).max(120) }).strict(),
        response: {
          200: z.object({
            trip_id: z.string().uuid(),
            released_to: z.string(),
            ledger_entries: z.number().int(),
            telemetry_points: z.number().int(),
            inspection_photos: z.number().int(),
            certificate: z
              .object({ cert_id: z.string(), sha256: z.string() })
              .nullable(),
            pending: z.array(z.string()),
          }),
        },
      },
    },
    async (request) => {
      const escalation = await getEscalation(request.params.id)
      if (escalation.level !== 'L5') {
        // Promote first, so the release is always preceded by a recorded decision.
        await promoteEscalation(
          request.params.id,
          'L5',
          request.auth!.userId,
          request.auth!.role,
          `Evidence release to ${request.body.recipient}`,
        )
      }
      return releaseEvidence(
        request.params.id,
        request.auth!.userId,
        request.auth!.role,
        request.body.recipient,
      )
    },
  )
}
