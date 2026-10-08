import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { tooManyRequests } from '../../lib/errors.js'
import { consumeQuota } from '../../lib/rate-limit.js'
import { requireAuth, requireRole } from '../auth/rbac.js'
import {
  advanceIfReady,
  getKycStatus,
  getOnboarding,
  requestAadhaarOtp,
  uploadDocument,
  verifyAadhaarOtp,
  verifyPan,
} from './service.js'

// Any signed-in person may verify: drivers must, customers may for the badge.
const ANY_SELF = ['CUSTOMER', 'DRIVER'] as const

/** Identity checks are paid API calls and a brute-force target; keep them slow. */
const kycQuota = async (request: FastifyRequest) => {
  const q = await consumeQuota(`kyc:${request.auth!.userId}`, 10, 3600)
  if (!q.allowed) {
    throw tooManyRequests('KYC_RATE_LIMITED', `Too many verification attempts. Try again in ${Math.ceil(q.retryAfterSeconds / 60)} min.`)
  }
}

const afterDriverAction = async (request: FastifyRequest) => {
  if (request.auth!.role === 'DRIVER') await advanceIfReady(request.auth!.userId)
}

export function registerKycRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.get('/v1/kyc/status', { onRequest: [requireAuth] }, async (request) =>
    getKycStatus(request.auth!.userId),
  )

  r.post(
    '/v1/kyc/pan',
    {
      onRequest: [requireAuth, requireRole(...ANY_SELF), kycQuota],
      schema: {
        body: z.object({ pan: z.string().min(10).max(12), name: z.string().min(2).max(120) }).strict(),
      },
    },
    async (request) => {
      const status = await verifyPan(request.auth!.userId, request.body.pan, request.body.name)
      await afterDriverAction(request)
      return status
    },
  )

  r.post(
    '/v1/kyc/aadhaar/otp',
    {
      onRequest: [requireAuth, requireRole(...ANY_SELF), kycQuota],
      schema: { body: z.object({ aadhaar: z.string().min(12).max(14) }).strict() },
    },
    async (request) => requestAadhaarOtp(request.auth!.userId, request.body.aadhaar),
  )

  r.post(
    '/v1/kyc/aadhaar/verify',
    {
      onRequest: [requireAuth, requireRole(...ANY_SELF)],
      schema: {
        body: z.object({ ref_id: z.string().min(1).max(120), otp: z.string().regex(/^\d{6}$/) }).strict(),
      },
    },
    async (request) => {
      const status = await verifyAadhaarOtp(request.auth!.userId, request.body.ref_id, request.body.otp)
      await afterDriverAction(request)
      return status
    },
  )

  /* ── Driver onboarding ─────────────────────────────────────────────── */

  r.get('/v1/driver/onboarding', { onRequest: [requireAuth, requireRole('DRIVER')] }, async (request) =>
    getOnboarding(request.auth!.userId),
  )

  r.post(
    '/v1/driver/documents',
    {
      onRequest: [requireAuth, requireRole('DRIVER')],
      // Same ceiling as Vault photos: an 8 MB file after base64 expansion.
      bodyLimit: 12 * 1024 * 1024,
      schema: {
        body: z
          .object({
            kind: z.enum(['DRIVING_LICENCE', 'POLICE_VERIFICATION', 'PHOTO', 'ADDRESS_PROOF', 'PAN', 'AADHAAR']),
            file_base64: z.string().min(16),
            number_last4: z.string().regex(/^[A-Z0-9]{4}$/i).optional(),
            expires_on: z.string().date().optional(),
          })
          .strict(),
      },
    },
    async (request, reply) => {
      const doc = await uploadDocument({
        driverId: request.auth!.userId,
        kind: request.body.kind,
        base64: request.body.file_base64,
        numberLast4: request.body.number_last4?.toUpperCase(),
        expiresOn: request.body.expires_on,
      })
      await afterDriverAction(request)
      return reply.status(201).send(doc)
    },
  )
}
