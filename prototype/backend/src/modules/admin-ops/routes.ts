/**
 * Operations and Finance endpoints.
 *
 * Role separation is the point of this file: FINANCE must not be able to
 * approve a driver, and OPS_MANAGER must not be able to mark money paid.
 * requireRole enforces that per route, independently of what the UI shows.
 */
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { requireAuth, requireRole } from '../auth/rbac.js'
import { audit } from '../safety-desk/service.js'
import {
  advancePayout,
  auditLog,
  awardBadge,
  checkinQueue,
  documentUrl,
  expiringNightShield,
  generatePayout,
  getDriver,
  gradeAttempt,
  gradingQueue,
  listAssessments,
  listBadges,
  listDrivers,
  listPayouts,
  qualifyNightShield,
  recordCheckin,
  revokeBadge,
  revokeNightShield,
  reviewDocument,
  setOnboardingStatus,
  shiftChecks,
  unsettled,
} from './service.js'

const OPS = ['OPS_MANAGER', 'SUPER_ADMIN'] as const
const FIN = ['FINANCE', 'SUPER_ADMIN'] as const
/** Reading a driver record is also useful to a desk agent handling an incident. */
const OPS_READ = ['OPS_MANAGER', 'SAFETY_DESK_AGENT', 'SUPER_ADMIN'] as const

const OnboardingStatus = z.enum([
  'PENDING',
  'TESTING',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
])

const Uuid = z.object({ id: z.string().uuid() })
const Limit = z.coerce.number().int().min(1).max(200).default(50)

export function registerAdminOpsRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>()

  /* ── Driver review ─────────────────────────────────────────────────── */

  r.get(
    '/v1/admin/drivers',
    {
      onRequest: [requireAuth, requireRole(...OPS_READ)],
      schema: { querystring: z.object({ status: OnboardingStatus.optional(), limit: Limit }) },
    },
    async (request) => ({ items: await listDrivers(request.query.status, request.query.limit) }),
  )

  r.get(
    '/v1/admin/drivers/:id',
    { onRequest: [requireAuth, requireRole(...OPS_READ)], schema: { params: Uuid } },
    async (request) => {
      const driver = await getDriver(request.params.id)
      await audit(request.auth!.userId, request.auth!.role, 'VIEW_DRIVER', request.params.id)
      return driver
    },
  )

  r.post(
    '/v1/admin/drivers/:id/status',
    {
      onRequest: [requireAuth, requireRole(...OPS)],
      schema: {
        params: Uuid,
        body: z.object({ status: OnboardingStatus, note: z.string().max(500).optional() }),
      },
    },
    async (request) =>
      setOnboardingStatus(
        request.params.id,
        request.body.status,
        request.auth!.userId,
        request.auth!.role,
        request.body.note,
      ),
  )

  /* ── Documents ─────────────────────────────────────────────────────── */

  r.get(
    '/v1/admin/documents/:id/url',
    { onRequest: [requireAuth, requireRole(...OPS_READ)], schema: { params: Uuid } },
    async (request) => documentUrl(request.params.id, request.auth!.userId, request.auth!.role),
  )

  r.post(
    '/v1/admin/documents/:id/review',
    {
      onRequest: [requireAuth, requireRole(...OPS)],
      schema: {
        params: Uuid,
        body: z.object({
          status: z.enum(['VERIFIED', 'REJECTED']),
          reject_reason: z.string().max(500).optional(),
        }),
      },
    },
    async (request) =>
      reviewDocument(
        request.params.id,
        request.body.status,
        request.auth!.userId,
        request.auth!.role,
        request.body.reject_reason,
      ),
  )

  /* ── Assessments and badges ────────────────────────────────────────── */

  r.get(
    '/v1/admin/assessments',
    { onRequest: [requireAuth, requireRole(...OPS_READ)] },
    async () => ({ items: await listAssessments() }),
  )

  r.get(
    '/v1/admin/attempts/pending',
    {
      onRequest: [requireAuth, requireRole(...OPS)],
      schema: { querystring: z.object({ limit: Limit }) },
    },
    async (request) => ({ items: await gradingQueue(request.query.limit) }),
  )

  r.post(
    '/v1/admin/attempts/:id/grade',
    {
      onRequest: [requireAuth, requireRole(...OPS)],
      schema: {
        params: Uuid,
        // A grader supplies a score. Whether that is a pass is the
        // assessment's threshold to decide, not the grader's.
        body: z.object({
          score: z.number().int().min(0).max(100),
          notes: z.string().max(1000).optional(),
        }),
      },
    },
    async (request) =>
      gradeAttempt(
        request.params.id,
        request.body.score,
        request.auth!.userId,
        request.auth!.role,
        request.body.notes,
      ),
  )

  r.get('/v1/admin/badges', { onRequest: [requireAuth, requireRole(...OPS_READ)] }, async () => ({
    items: await listBadges(),
  }))

  r.post(
    '/v1/admin/drivers/:id/badges',
    {
      onRequest: [requireAuth, requireRole(...OPS)],
      schema: { params: Uuid, body: z.object({ badge_code: z.string().min(1).max(64) }) },
    },
    async (request) =>
      awardBadge(
        request.params.id,
        request.body.badge_code,
        request.auth!.userId,
        request.auth!.role,
      ),
  )

  r.post(
    '/v1/admin/drivers/:id/badges/revoke',
    {
      onRequest: [requireAuth, requireRole(...OPS)],
      schema: {
        params: Uuid,
        body: z.object({ badge_code: z.string().min(1).max(64), reason: z.string().min(1).max(500) }),
      },
    },
    async (request) =>
      revokeBadge(
        request.params.id,
        request.body.badge_code,
        request.body.reason,
        request.auth!.userId,
        request.auth!.role,
      ),
  )

  /* ── Night Shield ──────────────────────────────────────────────────── */

  r.post(
    '/v1/admin/drivers/:id/night-shield',
    { onRequest: [requireAuth, requireRole(...OPS)], schema: { params: Uuid } },
    async (request) =>
      qualifyNightShield(request.params.id, request.auth!.userId, request.auth!.role),
  )

  r.post(
    '/v1/admin/drivers/:id/night-shield/revoke',
    {
      onRequest: [requireAuth, requireRole(...OPS)],
      schema: { params: Uuid, body: z.object({ reason: z.string().min(1).max(500) }) },
    },
    async (request) =>
      revokeNightShield(
        request.params.id,
        request.body.reason,
        request.auth!.userId,
        request.auth!.role,
      ),
  )

  r.get(
    '/v1/admin/night-shield/expiring',
    {
      onRequest: [requireAuth, requireRole(...OPS_READ)],
      schema: { querystring: z.object({ days: z.coerce.number().int().min(1).max(180).default(14) }) },
    },
    async (request) => ({ items: await expiringNightShield(request.query.days) }),
  )

  r.get(
    '/v1/admin/night-shield/checks',
    {
      onRequest: [requireAuth, requireRole(...OPS_READ)],
      schema: { querystring: z.object({ shift_date: z.string().date().optional() }) },
    },
    async (request) => ({ items: await shiftChecks(request.query.shift_date) }),
  )

  /* ── Post-trip check-ins ───────────────────────────────────────────── */

  r.get(
    '/v1/admin/checkins',
    {
      // The 10-minute welfare call is Safety Desk work, not ops work.
      onRequest: [requireAuth, requireRole('SAFETY_DESK_AGENT', 'OPS_MANAGER', 'SUPER_ADMIN')],
      schema: {
        querystring: z.object({ include_done: z.coerce.boolean().default(false), limit: Limit }),
      },
    },
    async (request) => ({
      items: await checkinQueue(request.query.include_done, request.query.limit),
    }),
  )

  r.post(
    '/v1/admin/checkins/:id',
    {
      onRequest: [requireAuth, requireRole('SAFETY_DESK_AGENT', 'OPS_MANAGER', 'SUPER_ADMIN')],
      schema: {
        params: Uuid,
        body: z.object({
          outcome: z.enum(['SAFE', 'NO_ANSWER', 'NEEDS_FOLLOWUP', 'ESCALATED']),
          notes: z.string().max(1000).optional(),
        }),
      },
    },
    async (request) =>
      recordCheckin(
        request.params.id,
        request.body.outcome,
        request.auth!.userId,
        request.auth!.role,
        request.body.notes,
      ),
  )

  /* ── Payouts ───────────────────────────────────────────────────────── */

  r.get(
    '/v1/admin/payouts',
    {
      onRequest: [requireAuth, requireRole(...FIN)],
      schema: {
        querystring: z.object({
          status: z.enum(['PENDING', 'APPROVED', 'PAID', 'FAILED']).optional(),
          limit: Limit,
        }),
      },
    },
    async (request) => ({ items: await listPayouts(request.query.status, request.query.limit) }),
  )

  r.get(
    '/v1/admin/payouts/unsettled',
    {
      onRequest: [requireAuth, requireRole(...FIN)],
      schema: { querystring: z.object({ period_start: z.string().date(), period_end: z.string().date() }) },
    },
    async (request) => ({
      items: await unsettled(request.query.period_start, request.query.period_end),
    }),
  )

  r.post(
    '/v1/admin/payouts/generate',
    {
      onRequest: [requireAuth, requireRole(...FIN)],
      schema: {
        body: z.object({
          driver_id: z.string().uuid(),
          period_start: z.string().date(),
          period_end: z.string().date(),
        }),
      },
    },
    async (request) =>
      generatePayout(
        request.body.driver_id,
        request.body.period_start,
        request.body.period_end,
        request.auth!.userId,
        request.auth!.role,
      ),
  )

  r.post(
    '/v1/admin/payouts/:id/advance',
    {
      onRequest: [requireAuth, requireRole(...FIN)],
      schema: {
        params: Uuid,
        body: z.object({
          to: z.enum(['APPROVED', 'PAID', 'FAILED']),
          reference: z.string().max(200).optional(),
        }),
      },
    },
    async (request) =>
      advancePayout(
        request.params.id,
        request.body.to,
        request.auth!.userId,
        request.auth!.role,
        request.body.reference,
      ),
  )

  /* ── Audit ledger ──────────────────────────────────────────────────── */

  r.get(
    '/v1/admin/audit',
    {
      // The ledger records what every operator did, including their superiors.
      // Only SUPER_ADMIN reads it.
      onRequest: [requireAuth, requireRole('SUPER_ADMIN')],
      schema: {
        querystring: z.object({
          actor: z.string().uuid().optional(),
          subject: z.string().optional(),
          action: z.string().optional(),
          limit: Limit,
        }),
      },
    },
    async (request) => ({ items: await auditLog(request.query) }),
  )
}
