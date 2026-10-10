import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { demoVisible } from '../../lib/demo.js'
import { requireAuth, requireRole } from '../auth/rbac.js'
import {
  getCustomer,
  getTripDetail,
  listAllRateCards,
  overview,
  searchCustomers,
  searchTrips,
  updateRateCard,
} from './service.js'

// Support lookups: the desk and ops answer customers, finance checks charges.
const SUPPORT = ['SAFETY_DESK_AGENT', 'OPS_MANAGER', 'FINANCE', 'SUPER_ADMIN'] as const
const MANAGERS = ['OPS_MANAGER', 'FINANCE', 'SUPER_ADMIN'] as const
// Prices are a money decision: Finance and super admins change them.
const PRICING_EDIT = ['FINANCE', 'SUPER_ADMIN'] as const

const TripStatus = z.enum(['REQUESTED', 'MATCHED', 'HANDSHAKE_PENDING', 'IN_TRIP', 'COMPLETED', 'CANCELLED', 'NO_DRIVERS_FOUND', 'ESCALATED'])
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export function registerAdminSupportRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>()

  // Lets the console show a "demo data" banner, so nobody mistakes it for real.
  r.get('/v1/admin/settings', { onRequest: [requireAuth, requireRole(...SUPPORT)] }, async () => ({
    demo_data_visible: demoVisible(),
  }))

  r.get(
    '/v1/admin/trips',
    {
      onRequest: [requireAuth, requireRole(...SUPPORT)],
      schema: {
        querystring: z.object({
          q: z.string().max(120).optional(),
          status: TripStatus.optional(),
          from: Day.optional(),
          to: Day.optional(),
          customer_id: z.string().uuid().optional(),
          driver_id: z.string().uuid().optional(),
          cursor: z.string().max(200).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(25),
        }),
      },
    },
    async (request) => {
      const q = request.query
      return searchTrips({ q: q.q, status: q.status, from: q.from, to: q.to, customerId: q.customer_id, driverId: q.driver_id, cursor: q.cursor, limit: q.limit })
    },
  )

  r.get(
    '/v1/admin/trips/:id',
    { onRequest: [requireAuth, requireRole(...SUPPORT)], schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request) => getTripDetail(request.params.id, request.auth!.userId, request.auth!.role),
  )

  r.get(
    '/v1/admin/customers',
    {
      onRequest: [requireAuth, requireRole(...SUPPORT)],
      schema: { querystring: z.object({ q: z.string().max(120).optional(), limit: z.coerce.number().int().min(1).max(100).default(25) }) },
    },
    async (request) => ({ items: await searchCustomers(request.query.q, request.query.limit) }),
  )

  r.get(
    '/v1/admin/customers/:id',
    { onRequest: [requireAuth, requireRole(...SUPPORT)], schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request) => getCustomer(request.params.id, request.auth!.userId, request.auth!.role),
  )

  r.get(
    '/v1/admin/overview',
    {
      onRequest: [requireAuth, requireRole(...MANAGERS)],
      schema: { querystring: z.object({ days: z.coerce.number().int().refine((d) => [7, 30, 90].includes(d), 'days must be 7, 30 or 90').default(30) }) },
    },
    async (request) => overview(request.query.days),
  )

  r.get('/v1/admin/rate-cards', { onRequest: [requireAuth, requireRole(...MANAGERS)] }, async () => ({
    items: await listAllRateCards(),
  }))

  r.patch(
    '/v1/admin/rate-cards/:skill_id',
    {
      onRequest: [requireAuth, requireRole(...PRICING_EDIT)],
      schema: {
        params: z.object({ skill_id: z.string().min(1).max(40) }),
        body: z
          .object({
            // Sanity bounds: a typo of an extra zero must not reach customers.
            per_km_rate: z.number().min(1).max(500).optional(),
            hourly_rate: z.number().min(10).max(10_000).optional(),
            included_km_per_hour: z.number().int().min(0).max(100).optional(),
            active: z.boolean().optional(),
            reason: z.string().trim().max(300).optional(),
          })
          .strict()
          .refine((b) => Object.keys(b).some((k) => k !== 'reason'), 'Send at least one price field'),
      },
    },
    async (request) => updateRateCard(request.params.skill_id, request.body, request.auth!.userId, request.auth!.role),
  )
}
