import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { requireAuth, requireRole } from '../auth/rbac.js'
import {
  capturePhoto,
  completeInspection,
  inspectionStatus,
  issueCertificate,
  startInspection,
  vaultPhotos,
} from './service.js'
import { INSPECTION_ZONES } from './zones.js'

const ZoneSchema = z.enum(INSPECTION_ZONES)
const PhaseSchema = z.enum(['PRE', 'POST'])

export function registerVaultRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.post(
    '/v1/trips/:id/inspections/:phase',
    {
      onRequest: [requireAuth, requireRole('DRIVER')],
      schema: {
        params: z.object({ id: z.string().uuid(), phase: PhaseSchema }),
        response: {
          200: z.object({
            inspection_id: z.string().uuid(),
            phase: PhaseSchema,
            remaining: z.array(ZoneSchema),
          }),
        },
      },
    },
    async (request) =>
      startInspection(request.params.id, request.auth!.userId, request.params.phase),
  )

  r.post(
    '/v1/trips/:id/inspections/:phase/photos',
    {
      onRequest: [requireAuth, requireRole('DRIVER')],
      // 12 MB covers an 8 MB image after base64 expansion.
      bodyLimit: 12 * 1024 * 1024,
      schema: {
        params: z.object({ id: z.string().uuid(), phase: PhaseSchema }),
        body: z
          .object({
            zone: ZoneSchema,
            photo_base64: z.string().min(16),
            lat: z.number().min(-90).max(90).optional(),
            lng: z.number().min(-180).max(180).optional(),
          })
          .strict(),
        response: {
          200: z.object({
            zone: ZoneSchema,
            sha256: z.string(),
            remaining: z.array(ZoneSchema),
            complete: z.boolean(),
          }),
        },
      },
    },
    async (request) =>
      capturePhoto({
        tripId: request.params.id,
        driverId: request.auth!.userId,
        phase: request.params.phase,
        zone: request.body.zone,
        photoBase64: request.body.photo_base64,
        ...(request.body.lat != null ? { lat: request.body.lat } : {}),
        ...(request.body.lng != null ? { lng: request.body.lng } : {}),
      }),
  )

  r.post(
    '/v1/trips/:id/inspections/:phase/complete',
    {
      onRequest: [requireAuth, requireRole('DRIVER')],
      schema: {
        params: z.object({ id: z.string().uuid(), phase: PhaseSchema }),
        response: {
          200: z.object({
            inspection_id: z.string().uuid(),
            photos: z.number().int(),
            sealed_at: z.coerce.string(),
          }),
        },
      },
    },
    async (request) =>
      completeInspection(request.params.id, request.auth!.userId, request.params.phase),
  )

  r.get(
    '/v1/trips/:id/inspections',
    {
      onRequest: [requireAuth],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            zones: z.array(ZoneSchema),
            phases: z.array(
              z.object({
                phase: PhaseSchema,
                sealed_at: z.coerce.string().nullable(),
                photos: z.array(
                  z.object({
                    zone: ZoneSchema,
                    sha256: z.string().nullable(),
                    captured_at: z.coerce.string().nullable(),
                  }),
                ),
              }),
            ),
          }),
        },
      },
    },
    async (request) => inspectionStatus(request.params.id, request.auth!.userId),
  )

  r.get(
    '/v1/trips/:id/vault/photos',
    {
      onRequest: [requireAuth],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.array(
            z.object({
              zone: ZoneSchema,
              phase: z.string(),
              sha256: z.string(),
              captured_at: z.coerce.string(),
              url: z.string(),
            }),
          ),
        },
      },
    },
    async (request) => vaultPhotos(request.params.id, request.auth!.userId),
  )

  r.post(
    '/v1/trips/:id/certificate',
    {
      onRequest: [requireAuth],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            cert_id: z.string(),
            url: z.string(),
            sha256: z.string(),
            issued_at: z.coerce.string(),
          }),
        },
      },
    },
    async (request) => issueCertificate(request.params.id, request.auth!.userId),
  )
}
