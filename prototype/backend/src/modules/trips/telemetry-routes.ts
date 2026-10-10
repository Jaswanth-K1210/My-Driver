import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { conflict, forbidden, notFound } from '../../lib/errors.js'
import { counter } from '../../lib/metrics.js'
import { loadTripRoles } from '../../realtime/gateway.js'
import { ingestTelemetry } from '../../telemetry/ingest.js'
import { requireAuth } from '../auth/rbac.js'

export const MAX_BATCH_POINTS = 300
// A phone can be offline for a while (tunnel, dead zone); older than this and
// the point no longer helps live safety and is likely a clock problem.
const MAX_POINT_AGE_MS = 6 * 60 * 60 * 1000

const Point = z
  .object({
    timestamp: z.number().int().positive(),
    coords: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        speed: z.number().min(0).max(400).optional(),
        heading: z.number().min(0).max(360).optional(),
      })
      .strict(),
    sensors: z.object({ accel_z: z.number().optional(), gyro_z: z.number().optional() }).strict().optional(),
  })
  .strict()

/**
 * Background telemetry over HTTP.
 *
 * When the app is backgrounded the OS suspends its WebSocket, and a
 * background location task (expo-task-manager) can only make plain requests.
 * The task buffers fixes and posts them here in batches. Each point goes
 * through the same ingest as a live frame, at the same 1-per-second ceiling.
 */
export function registerTelemetryRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.post(
    '/v1/trips/:id/telemetry',
    {
      onRequest: [requireAuth],
      bodyLimit: 256 * 1024,
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z
          .object({
            // The phone's clock when it sent the batch. Comparing it to each
            // point's timestamp gives the point's age without trusting the
            // phone's clock to agree with ours.
            sent_at: z.number().int().positive(),
            points: z.array(Point).min(1).max(MAX_BATCH_POINTS),
          })
          .strict(),
        response: { 202: z.object({ accepted: z.number().int(), dropped: z.number().int() }) },
      },
    },
    async (request, reply) => {
      const tripId = request.params.id
      const userId = request.auth!.userId
      const trip = await loadTripRoles(tripId)
      if (!trip) throw notFound('TRIP_NOT_FOUND', 'No such trip')

      const source = trip.driver_id === userId ? 'DRIVER' : trip.customer_id === userId ? 'CUSTOMER' : null
      if (!source) throw forbidden('FORBIDDEN_TRIP', 'You are not a participant on this trip')
      if (trip.status !== 'IN_TRIP' && trip.status !== 'HANDSHAKE_PENDING') {
        throw conflict('TRIP_NOT_ACTIVE', 'Telemetry is only accepted on an active trip')
      }

      const now = Date.now()
      const { sent_at: sentAt } = request.body
      // Oldest first, then thin to one point per second: the same ceiling the
      // socket enforces, so a batch cannot flood the hypertable.
      const sorted = [...request.body.points].sort((a, b) => a.timestamp - b.timestamp)
      const kept: typeof sorted = []
      for (const p of sorted) {
        const ageMs = sentAt - p.timestamp
        if (ageMs < -60_000 || ageMs > MAX_POINT_AGE_MS) continue
        const prev = kept.at(-1)
        if (prev && p.timestamp - prev.timestamp < 1000) continue
        kept.push(p)
      }

      for (const [i, p] of kept.entries()) {
        const live = i === kept.length - 1
        // Re-express the point's age on the server clock.
        const seenAt = now - Math.max(0, sentAt - p.timestamp)
        // Rebase the stored time the same way, so a phone with a wrong clock
        // still lands its track at the right moment.
        await ingestTelemetry(tripId, userId, source, { ...p, timestamp: seenAt }, live, seenAt)
      }

      const dropped = request.body.points.length - kept.length
      if (dropped) counter('mydriver_telemetry_batch_dropped_total', dropped)
      return reply.status(202).send({ accepted: kept.length, dropped })
    },
  )
}
