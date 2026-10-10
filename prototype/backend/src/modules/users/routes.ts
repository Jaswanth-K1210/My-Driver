import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { ROLES } from '../auth/otp.js'
import { requireAuth } from '../auth/rbac.js'
import { listConsents, recordConsent } from './consents.js'
import { addGuardian, deleteGuardian, listGuardians, updateGuardian } from './guardians.js'
import { addVehicle, deleteVehicle, ENGINE_TYPES, listVehicles, TRANSMISSIONS, updateVehicle } from './vehicles.js'
import { getMe, updateMe } from './service.js'

const RoleSchema = z.enum(ROLES)
const PhoneNumber = z.string().regex(/^\+[1-9]\d{7,14}$/, 'must be E.164')

const MeSchema = z.object({
  id: z.string().uuid(),
  role: RoleSchema,
  roles: z.array(RoleSchema),
  phone_number: z.string().nullable(),
  email: z.string().nullable(),
  full_name: z.string().nullable(),
  created_at: z.coerce.string(),
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

  /* ── Garage: the customer's own cars ───────────────────────────────── */

  const VehicleBody = z
    .object({
      nickname: z.string().trim().min(1).max(40).nullable().optional(),
      company: z.string().trim().min(1).max(60),
      model: z.string().trim().min(1).max(60),
      engine_type: z.enum(ENGINE_TYPES),
      transmission: z.enum(TRANSMISSIONS),
      plate: z.string().trim().max(16).regex(/^[A-Za-z0-9 -]*$/, 'Letters, numbers and spaces only').nullable().optional(),
      is_default: z.boolean().optional(),
    })
    .strict()

  const VehicleSchema = z.object({
    id: z.string().uuid(),
    nickname: z.string().nullable(),
    company: z.string(),
    model: z.string(),
    engine_type: z.enum(ENGINE_TYPES),
    transmission: z.enum(TRANSMISSIONS),
    plate: z.string().nullable(),
    is_default: z.boolean(),
    created_at: z.coerce.string(),
  })

  r.get(
    '/v1/me/vehicles',
    { onRequest: [requireAuth], schema: { response: { 200: z.array(VehicleSchema) } } },
    async (request) => listVehicles(request.auth!.userId),
  )

  r.post(
    '/v1/me/vehicles',
    { onRequest: [requireAuth], schema: { body: VehicleBody, response: { 201: VehicleSchema } } },
    async (request, reply) => reply.status(201).send(await addVehicle(request.auth!.userId, request.body)),
  )

  r.patch(
    '/v1/me/vehicles/:id',
    {
      onRequest: [requireAuth],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: VehicleBody.partial().strict().refine((b) => Object.keys(b).length > 0, 'Send at least one field'),
        response: { 200: VehicleSchema },
      },
    },
    async (request) => updateVehicle(request.auth!.userId, request.params.id, request.body),
  )

  r.delete(
    '/v1/me/vehicles/:id',
    { onRequest: [requireAuth], schema: { params: z.object({ id: z.string().uuid() }), response: { 204: z.null() } } },
    async (request, reply) => {
      await deleteVehicle(request.auth!.userId, request.params.id)
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
