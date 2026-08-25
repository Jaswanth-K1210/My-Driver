import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { requireAuth } from '../auth/rbac.js'
import { listConsents, recordConsent } from './consents.js'
import { addGuardian, deleteGuardian, listGuardians, updateGuardian } from './guardians.js'
import { getMe, updateMe } from './service.js'

const RoleSchema = z.enum(['CUSTOMER', 'DRIVER', 'AGENT', 'ADMIN'])
const PhoneNumber = z.string().regex(/^\+[1-9]\d{7,14}$/, 'must be E.164')

const MeSchema = z.object({
  id: z.string().uuid(),
  role: RoleSchema,
  roles: z.array(RoleSchema),
  phone_number: z.string().nullable(),
  email: z.string().nullable(),
  full_name: z.string().nullable(),
})

const GuardianSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  relation: z.string().nullable(),
  phone: z.string(),
  position: z.number().int(),
})

const ConsentPurposeSchema = z.enum([
  'LOCATION_TRACKING',
  'TELEMATICS_COLLECTION',
  'GUARDIAN_SHARING',
  'BIOMETRIC_LIVENESS',
])

const ConsentSchema = z.object({
  id: z.string().uuid(),
  purpose: ConsentPurposeSchema,
  version: z.string(),
  granted_at: z.coerce.string(),
  revoked_at: z.coerce.string().nullable(),
})

export function registerUserRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.get(
    '/v1/me',
    { onRequest: [requireAuth], schema: { response: { 200: MeSchema } } },
    async (request) => getMe(request.auth!.userId, request.auth!.role),
  )

  r.patch(
    '/v1/me',
    {
      onRequest: [requireAuth],
      schema: {
        body: z
          .object({
            full_name: z.string().min(1).max(120).optional(),
            email: z.string().email().max(254).optional(),
          })
          .strict(),
        response: { 200: MeSchema },
      },
    },
    async (request) => updateMe(request.auth!.userId, request.auth!.role, request.body),
  )

  r.get(
    '/v1/me/guardians',
    { onRequest: [requireAuth], schema: { response: { 200: z.array(GuardianSchema) } } },
    async (request) => listGuardians(request.auth!.userId),
  )

  r.post(
    '/v1/me/guardians',
    {
      onRequest: [requireAuth],
      schema: {
        body: z
          .object({
            name: z.string().min(1).max(120),
            relation: z.string().max(60).optional(),
            phone: PhoneNumber,
          })
          .strict(),
        response: { 201: GuardianSchema },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await addGuardian(request.auth!.userId, request.body)),
  )

  r.patch(
    '/v1/me/guardians/:id',
    {
      onRequest: [requireAuth],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z
          .object({
            name: z.string().min(1).max(120).optional(),
            relation: z.string().max(60).optional(),
            phone: PhoneNumber.optional(),
          })
          .strict(),
        response: { 200: GuardianSchema },
      },
    },
    async (request) => updateGuardian(request.auth!.userId, request.params.id, request.body),
  )

  r.delete(
    '/v1/me/guardians/:id',
    {
      onRequest: [requireAuth],
      schema: { params: z.object({ id: z.string().uuid() }), response: { 204: z.null() } },
    },
    async (request, reply) => {
      await deleteGuardian(request.auth!.userId, request.params.id)
      return reply.status(204).send(null)
    },
  )

  r.get(
    '/v1/me/consents',
    { onRequest: [requireAuth], schema: { response: { 200: z.array(ConsentSchema) } } },
    async (request) => listConsents(request.auth!.userId),
  )

  r.post(
    '/v1/me/consents',
    {
      onRequest: [requireAuth],
      schema: {
        body: z
          .object({
            purpose: ConsentPurposeSchema,
            version: z.string().min(1).max(40),
            granted: z.boolean(),
          })
          .strict(),
        response: { 201: ConsentSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await recordConsent(
            request.auth!.userId,
            request.body.purpose,
            request.body.version,
            request.body.granted,
          ),
        ),
  )
}
