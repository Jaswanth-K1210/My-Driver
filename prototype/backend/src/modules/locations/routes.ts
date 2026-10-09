import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { AppError, tooManyRequests } from '../../lib/errors.js'
import { consumeQuota } from '../../lib/rate-limit.js'
import { requireAuth } from '../auth/rbac.js'
import { searchLocations } from './service.js'

const PlaceSchema = z.object({ id: z.string(), name: z.string(), address: z.string(), lat: z.number(), lng: z.number() })

// Every uncached search is a paid upstream call, so it is signed-in only and
// capped per person. 60 a minute covers fast typing with a client debounce.
const searchQuota = async (request: FastifyRequest) => {
  const q = await consumeQuota(`locsearch:${request.auth!.userId}`, 60, 60)
  if (!q.allowed) throw tooManyRequests('SEARCH_RATE_LIMITED', 'Too many searches. Wait a moment and try again.')
}

export function registerLocationRoutes(app: FastifyInstance): void {
  const r = app.withTypeProvider<ZodTypeProvider>()

  r.get(
    '/v1/locations/search',
    {
      onRequest: [requireAuth, searchQuota],
      schema: {
        querystring: z
          .object({
            q: z.string().trim().min(2, 'Type at least 2 characters').max(100),
            lat: z.coerce.number().min(-90).max(90).optional(),
            lng: z.coerce.number().min(-180).max(180).optional(),
          })
          .refine((v) => (v.lat === undefined) === (v.lng === undefined), 'Send lat and lng together'),
        response: { 200: z.object({ results: z.array(PlaceSchema), cached: z.boolean() }) },
      },
    },
    async (request) => {
      const { q, lat, lng } = request.query
      try {
        return await searchLocations(q, lat !== undefined && lng !== undefined ? { lat, lng } : undefined)
      } catch (err) {
        request.log.warn({ err }, 'location search upstream failed')
        throw new AppError(503, 'LOCATION_SEARCH_UNAVAILABLE', 'Location search is unavailable right now. Try again shortly.')
      }
    },
  )
}
