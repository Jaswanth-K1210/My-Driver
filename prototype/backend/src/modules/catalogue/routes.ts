import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { getTripConfig } from './trip-config.js'

export function registerCatalogueRoutes(app: FastifyInstance): void {
  // Public and identical for everyone, so the app can cache it. The ETag is a
  // hash of the payload itself, so a rate-card change invalidates it even if
  // nobody remembered to bump CONFIG_VERSION.
  app.get('/v1/catalogue/trip-config', async (request, reply) => {
    const body = JSON.stringify(await getTripConfig())
    const etag = `"${createHash('sha256').update(body).digest('base64url').slice(0, 22)}"`
    reply.header('cache-control', 'public, max-age=300').header('etag', etag)
    if (request.headers['if-none-match'] === etag) return reply.status(304).send()
    return reply.type('application/json').send(body)
  })
}
