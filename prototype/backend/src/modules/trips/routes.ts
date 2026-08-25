import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { badRequest } from '../../lib/errors.js'
import { estimateRoadDistanceKm } from '../../lib/geo.js'
import { issueTicket, TICKET_TTL_SECONDS } from '../../realtime/ticket.js'
import { requireAuth, requireRole } from '../auth/rbac.js'
import { trackDispatch } from './dispatch-tracker.js'
import { computeFare } from './fare.js'
import { setAvailability } from './geo-index.js'
import { performHandshake } from './handshake.js'
import { respondToOffer, startDispatch } from './matching.js'
import { getRateCard } from './rate-cards.js'
import {
  bookTrip,
  cancelTrip,
  completeTrip,
  getDriverSummary,
  getTripForParticipant,
  issueHandshakeOtpForCustomer,
  listTrips,
  rateTrip,
} from './service.js'

export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

const FareSchema = z.object({
  base: z.number(),
  platform_fee: z.number(),
  night_fee: z.number(),
  total: z.number(),
  driver_earnings: z.number(),
})

/**
 * .strict() is what rejects a stray `mode` field. The backend has zero dashcam
 * awareness, and a silently-ignored field would hide that from clients.
 */
export const QuoteBody = z
  .object({
    booking_type: z.enum(['POINT_TO_POINT', 'HOURLY']),
    hours: z.union([z.literal(2), z.literal(4), z.literal(8), z.literal(12)]).optional(),
    pickup: LatLngSchema,
    drop: LatLngSchema.optional(),
    required_certification: z.string().min(1).max(40),
  })
  .strict()

const TripStatusSchema = z.enum([
  'REQUESTED',
  'MATCHED',
  'HANDSHAKE_PENDING',
  'IN_TRIP',
  'COMPLETED',
  'CANCELLED',
  'NO_DRIVERS_FOUND',
  'ESCALATED',
])

const TripViewSchema = z.object({
  id: z.string().uuid(),
  customer_id: z.string().uuid(),
  driver_id: z.string().uuid().nullable(),
  status: TripStatusSchema,
  booking_type: z.enum(['POINT_TO_POINT', 'HOURLY']),
  hourly_package_hours: z.number().int().nullable(),
  pickup: LatLngSchema,
  drop: LatLngSchema.nullable(),
  required_certification: z.string(),
  speed_ceiling_kmh: z.number().int(),
  estimated_distance_km: z.number().nullable(),
  estimated_fare: z.number().nullable(),
  distance_km: z.number().nullable(),
  duration_min: z.number().int().nullable(),
  fare_amount: z.number().nullable(),
  driver_earnings: z.number().nullable(),
  requested_at: z.coerce.string(),
  completed_at: z.coerce.string().nullable(),
})

export function registerTripRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.post(
    '/v1/trips/quote',
    {
      onRequest: [requireAuth, requireRole('CUSTOMER')],
      schema: {
        body: QuoteBody,
        response: {
          200: z.object({
            distance_km: z.number(),
            required_certification: z.string(),
            fare: FareSchema,
          }),
        },
      },
    },
    async (request) => {
      const body = request.body
      if (body.booking_type === 'POINT_TO_POINT' && !body.drop) {
        throw badRequest('DROP_REQUIRED', 'A drop location is required for a point-to-point trip')
      }

      const card = await getRateCard(body.required_certification)
      const distanceKm = body.drop ? estimateRoadDistanceKm(body.pickup, body.drop) : 0

      return {
        distance_km: Math.round(distanceKm * 100) / 100,
        required_certification: card.skill_id,
        fare: computeFare({
          bookingType: body.booking_type,
          distanceKm,
          hours: body.hours,
          perKmRate: card.per_km_rate,
          hourlyRate: card.hourly_rate,
          pickupAt: new Date(),
        }),
      }
    },
  )

  r.post(
    '/v1/trips/book',
    {
      onRequest: [requireAuth, requireRole('CUSTOMER')],
      schema: {
        body: QuoteBody.extend({
          speed_ceiling_kmh: z.number().int().min(20).max(120),
          pickup_address: z.string().max(240).optional(),
          drop_address: z.string().max(240).optional(),
        }).strict(),
        response: { 201: TripViewSchema },
      },
    },
    async (request, reply) => {
      const b = request.body
      if (b.booking_type === 'POINT_TO_POINT' && !b.drop) {
        throw badRequest('DROP_REQUIRED', 'A drop location is required for a point-to-point trip')
      }

      const idempotencyKey = request.headers['idempotency-key']
      const trip = await bookTrip({
        customerId: request.auth!.userId,
        bookingType: b.booking_type,
        hours: b.hours,
        pickup: b.pickup,
        pickupAddress: b.pickup_address,
        drop: b.drop,
        dropAddress: b.drop_address,
        requiredCertification: b.required_certification,
        speedCeilingKmh: b.speed_ceiling_kmh,
        idempotencyKey: typeof idempotencyKey === 'string' ? idempotencyKey : undefined,
      })

      // Dispatch runs out of band: booking must not block on driver search.
      if (trip.status === 'REQUESTED') {
        trackDispatch(
          startDispatch(trip.id).catch((err) =>
            app.log.error({ err, tripId: trip.id }, 'dispatch failed'),
          ),
        )
      }

      return reply.status(201).send(trip)
    },
  )

  r.get(
    '/v1/trips',
    {
      onRequest: [requireAuth],
      schema: {
        querystring: z.object({
          cursor: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(50).default(20),
        }),
        response: {
          200: z.object({ items: z.array(TripViewSchema), next_cursor: z.string().nullable() }),
        },
      },
    },
    async (request) =>
      listTrips(request.auth!.userId, request.auth!.role, request.query.cursor, request.query.limit),
  )

  r.get(
    '/v1/trips/:id',
    {
      onRequest: [requireAuth],
      schema: { params: z.object({ id: z.string().uuid() }), response: { 200: TripViewSchema } },
    },
    async (request) => getTripForParticipant(request.params.id, request.auth!.userId),
  )

  r.post(
    '/v1/trips/:id/cancel',
    {
      onRequest: [requireAuth],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ reason: z.string().min(1).max(240) }).strict(),
        response: { 200: TripViewSchema },
      },
    },
    async (request) =>
      cancelTrip(request.params.id, request.auth!.userId, request.auth!.role, request.body.reason),
  )

  r.post(
    '/v1/trips/:id/offer/respond',
    {
      onRequest: [requireAuth, requireRole('DRIVER')],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ accept: z.boolean() }).strict(),
        response: { 200: TripViewSchema },
      },
    },
    async (request) => respondToOffer(request.params.id, request.auth!.userId, request.body.accept),
  )

  r.post(
    '/v1/trips/:id/handshake-otp',
    {
      onRequest: [requireAuth, requireRole('CUSTOMER')],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        response: { 200: z.object({ otp: z.string().length(4) }) },
      },
    },
    async (request) => ({
      otp: await issueHandshakeOtpForCustomer(request.params.id, request.auth!.userId),
    }),
  )

  r.post(
    '/v1/trips/:id/handshake',
    {
      onRequest: [requireAuth, requireRole('DRIVER')],
      // 6 MB accommodates a 4 MB image after base64 expansion.
      bodyLimit: 6 * 1024 * 1024,
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z
          .object({
            driver_selfie_base64: z.string().min(4),
            otp: z.string().regex(/^\d{4}$/, 'must be 4 digits'),
          })
          .strict(),
        response: {
          200: z.object({
            status: z.literal('HANDSHAKE_PASSED'),
            trip_state: z.literal('IN_TRIP'),
          }),
        },
      },
    },
    async (request) =>
      performHandshake({
        tripId: request.params.id,
        driverId: request.auth!.userId,
        selfieBase64: request.body.driver_selfie_base64,
        otp: request.body.otp,
      }),
  )

  r.post(
    '/v1/trips/:id/complete',
    {
      onRequest: [requireAuth, requireRole('DRIVER')],
      schema: { params: z.object({ id: z.string().uuid() }), response: { 200: TripViewSchema } },
    },
    async (request) => completeTrip(request.params.id, request.auth!.userId),
  )

  r.post(
    '/v1/trips/:id/rate',
    {
      onRequest: [requireAuth, requireRole('CUSTOMER')],
      schema: {
        params: z.object({ id: z.string().uuid() }),
        body: z
          .object({
            rating: z.number().int().min(1).max(5),
            comment: z.string().max(500).optional(),
          })
          .strict(),
        response: { 200: z.object({ rating: z.number(), driver_rating: z.number() }) },
      },
    },
    async (request) =>
      rateTrip(request.params.id, request.auth!.userId, request.body.rating, request.body.comment),
  )

  r.post(
    '/v1/driver/availability',
    {
      onRequest: [requireAuth, requireRole('DRIVER')],
      schema: {
        body: z.object({ availability: z.enum(['OFFLINE', 'ONLINE', 'ON_TRIP']) }).strict(),
        response: {
          200: z.object({ availability: z.enum(['OFFLINE', 'ONLINE', 'ON_TRIP']) }),
        },
      },
    },
    async (request) => {
      await setAvailability(request.auth!.userId, request.body.availability)
      return { availability: request.body.availability }
    },
  )

  r.get(
    '/v1/driver/summary',
    {
      onRequest: [requireAuth, requireRole('DRIVER')],
      schema: {
        response: {
          200: z.object({
            mydriver_score: z.number(),
            rating: z.number().nullable(),
            total_trips: z.number().int(),
            trips_today: z.number().int(),
            earnings_today: z.number(),
            availability: z.enum(['OFFLINE', 'ONLINE', 'ON_TRIP']),
          }),
        },
      },
    },
    async (request) => getDriverSummary(request.auth!.userId),
  )

  r.post(
    '/v1/realtime/ticket',
    {
      onRequest: [requireAuth],
      schema: {
        response: { 200: z.object({ ticket: z.string(), expires_in: z.number().int() }) },
      },
    },
    async (request) => ({
      ticket: await issueTicket(request.auth!.userId, request.auth!.role),
      expires_in: TICKET_TTL_SECONDS,
    }),
  )
}
