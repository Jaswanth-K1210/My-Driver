import fastifyCors from '@fastify/cors'
import fastifyJwt from '@fastify/jwt'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod'
import { corsOrigins, env } from './config/env.js'
import { pool } from './db/client.js'
import { registerErrorHandler } from './lib/errors.js'
import { gauge, renderMetrics } from './lib/metrics.js'
import { registerAuthRoutes } from './modules/auth/routes.js'
import { registerTripRoutes } from './modules/trips/routes.js'
import { getIntegrityEngine } from './modules/integrity/engine.js'
import { registerSafetyRoutes } from './modules/safety-desk/routes.js'
import { registerUserRoutes } from './modules/users/routes.js'
import { registerVaultRoutes } from './modules/vault/routes.js'
import { openSocketCount, registerRealtimeGateway } from './realtime/gateway.js'
import { getHub } from './realtime/hub.js'
import { redis } from './redis/client.js'
import { getTelemetryWriter } from './telemetry/batch-writer.js'

let ready = true

/** Flipped false at the start of shutdown so the load balancer drains us first. */
export const setReady = (value: boolean): void => {
  ready = value
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } }
          : undefined,
    },
    // Trust the proxy so rate limiting sees the real client IP behind a load balancer.
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  registerErrorHandler(app)

  // The website runs on a different origin from the API. Native apps are
  // unaffected — CORS is a browser policy.
  await app.register(fastifyCors, {
    origin: env.NODE_ENV === 'production' ? corsOrigins() : true,
    credentials: false,
    allowedHeaders: ['content-type', 'authorization', 'idempotency-key'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  await app.register(fastifyJwt, { secret: env.JWT_SECRET })
  await registerRealtimeGateway(app)

  registerAuthRoutes(app)
  registerUserRoutes(app)
  registerTripRoutes(app)
  registerSafetyRoutes(app)
  registerVaultRoutes(app)

  // "Is this process alive" — for the container runtime.
  app.get('/health', async () => ({ status: 'ok', service: 'mydriver-backend' }))

  // "Should the load balancer send traffic here" — must fail during drain.
  app.get('/ready', async (_request, reply) => {
    if (!ready) {
      return reply
        .status(503)
        .send({ error: { code: 'DRAINING', message: 'Shutting down' } })
    }
    try {
      await pool.query('SELECT 1')
      await redis.ping()
      return { status: 'ready' }
    } catch {
      return reply.status(503).send({
        error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'A dependency is unreachable' },
      })
    }
  })

  app.get('/metrics', async (_request, reply) =>
    reply.type('text/plain; version=0.0.4').send(renderMetrics()),
  )

  return app
}

// Every open socket, subscribed or not. The hub only knows about sockets that
// joined a trip room, which is a different (and much smaller) number.
gauge('mydriver_ws_connections', () => openSocketCount())
gauge('mydriver_ws_subscribed', () => getHub().localSocketCount())
gauge('mydriver_telemetry_buffer_depth', () => getTelemetryWriter().depth)
gauge('mydriver_telemetry_dropped_total', () => getTelemetryWriter().dropped)
gauge('mydriver_telemetry_written_total', () => getTelemetryWriter().written)
// Reported by the process about itself: far more reliable than an external
// sampler, and the number an operator actually wants next to the socket count.
gauge('mydriver_integrity_tracked_trips', () => getIntegrityEngine().trackedTrips)

gauge('mydriver_process_rss_bytes', () => process.memoryUsage.rss())
gauge('mydriver_process_heap_used_bytes', () => process.memoryUsage().heapUsed)

gauge('mydriver_db_pool_total', () => pool.totalCount)
gauge('mydriver_db_pool_idle', () => pool.idleCount)
gauge('mydriver_db_pool_waiting', () => pool.waitingCount)
