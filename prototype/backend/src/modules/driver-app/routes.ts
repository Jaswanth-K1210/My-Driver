import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { requireAuth, requireRole } from '../auth/rbac.js'
import { getDriverAssessments, getDriverEarnings, getDriverProfile } from './service.js'

const Total = z.object({ earnings: z.number(), trips: z.number().int() })

export function registerDriverAppRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const driverOnly = { onRequest: [requireAuth, requireRole('DRIVER')] }

  r.get(
    '/v1/driver/earnings',
    {
      ...driverOnly,
      schema: {
        response: {
          200: z.object({
            today: Total,
            this_week: Total,
            // Completed trips not yet claimed by a payout.
            unsettled: Total,
            daily: z.array(z.object({ date: z.string(), trips: z.number().int(), earnings: z.number() })),
            trips: z.array(
              z.object({
                trip_id: z.string().uuid(),
                completed_at: z.coerce.string().nullable(),
                pickup_address: z.string().nullable(),
                drop_address: z.string().nullable(),
                fare_amount: z.number().nullable(),
                driver_earnings: z.number().nullable(),
                payout_status: z.enum(['PENDING', 'APPROVED', 'PAID', 'FAILED']).nullable(),
              }),
            ),
            payouts: z.array(
              z.object({
                id: z.string().uuid(),
                period_start: z.string(),
                period_end: z.string(),
                trip_count: z.number().int(),
                gross: z.number(),
                platform_fee: z.number(),
                net: z.number(),
                status: z.enum(['PENDING', 'APPROVED', 'PAID', 'FAILED']),
                reference: z.string().nullable(),
                paid_at: z.coerce.string().nullable(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => getDriverEarnings(request.auth!.userId),
  )

  r.get(
    '/v1/driver/assessments',
    {
      ...driverOnly,
      schema: {
        response: {
          200: z.array(
            z.object({
              code: z.string(),
              title: z.string(),
              kind: z.enum(['WRITTEN', 'PRACTICAL', 'LIVENESS', 'REACTION', 'DOCUMENT_REVIEW']),
              passing_score: z.number().int(),
              state: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'AWAITING_RESULT', 'PASSED', 'FAILED']),
              attempts_used: z.number().int(),
              attempts_left: z.number().int(),
              last_score: z.number().nullable(),
              last_submitted_at: z.string().nullable(),
              retry_at: z.string().nullable(),
              examiner_notes: z.string().nullable(),
            }),
          ),
        },
      },
    },
    async (request) => getDriverAssessments(request.auth!.userId),
  )

  r.get(
    '/v1/driver/profile',
    {
      ...driverOnly,
      schema: {
        response: {
          200: z.object({
            full_name: z.string().nullable(),
            phone_number: z.string().nullable(),
            joined_at: z.coerce.string(),
            mydriver_score: z.number(),
            rating: z.number().nullable(),
            rating_count: z.number().int(),
            total_trips: z.number().int(),
            certifications: z.array(z.string()),
            onboarding_status: z.string(),
            badges: z.array(
              z.object({
                code: z.string(),
                label: z.string(),
                description: z.string().nullable(),
                grants_skill: z.string().nullable(),
                awarded_at: z.coerce.string(),
                expires_at: z.coerce.string().nullable(),
              }),
            ),
            night_shield: z.object({
              status: z.enum(['NOT_QUALIFIED', 'ACTIVE', 'EXPIRED', 'REVOKED']),
              qualified_at: z.string().nullable(),
              expires_at: z.string().nullable(),
              reason: z.string().nullable(),
            }),
            documents: z.array(
              z.object({
                id: z.string().uuid(),
                kind: z.string(),
                status: z.enum(['SUBMITTED', 'VERIFIED', 'REJECTED', 'EXPIRED']),
                number_last4: z.string().nullable(),
                expires_on: z.string().nullable(),
                reject_reason: z.string().nullable(),
              }),
            ),
          }),
        },
      },
    },
    async (request) => getDriverProfile(request.auth!.userId),
  )
}
