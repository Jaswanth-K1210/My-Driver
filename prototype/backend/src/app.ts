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
import { forbidden, registerErrorHandler } from './lib/errors.js'
import { gauge, renderMetrics } from './lib/metrics.js'
import { registerAdminOpsRoutes } from './modules/admin-ops/routes.js'
import { registerAuthRoutes } from './modules/auth/routes.js'
import { registerCatalogueRoutes } from './modules/catalogue/routes.js'
import { registerKycRoutes } from './modules/kyc/routes.js'
import { registerLocationRoutes } from './modules/locations/routes.js'
import { registerTelemetryRoutes } from './modules/trips/telemetry-routes.js'
import { registerPaymentRoutes } from './modules/payments/routes.js'
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
      // Bearer tokens, refresh tokens, OTPs and signatures must never reach
      // the log store, even at debug level.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-razorpay-signature"]',
          'req.query.ticket',
          'body.otp',
          'body.refresh_token',
          'body.password',
        ],
        censor: '[redacted]',
      },
    },
    // Hard ceiling on a request body. Uploads that need more (documents,
    // inspection photos) raise it on their own route.
    bodyLimit: 1024 * 1024,
    // Trust the proxy so rate limiting sees the real client IP behind a load balancer.
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  registerErrorHandler(app)

  // The customer website and the operations console are separate sites.
  // Browsers send an Origin header, so a staff sign-in or admin call made from
  // the customer site is refused outright, on top of the role checks. Calls
  // with no Origin (servers, scripts, mobile apps) are judged by role alone.
  const customerOrigin = new URL(env.PUBLIC_WEB_URL).origin
  const adminOrigin = new URL(env.ADMIN_WEB_URL).origin
  app.addHook('onRequest', async (request) => {
    const origin = request.headers.origin
    if (!origin) return
    const path = request.url
    if (path.startsWith('/v1/auth/staff/') && origin !== adminOrigin) {
      throw forbidden('STAFF_SIGNIN_ORIGIN', 'Staff sign-in is only available on the operations console')
    }
    if (path.startsWith('/v1/admin/') && origin === customerOrigin) {
      throw forbidden('WRONG_SITE', 'Admin APIs are not available from the customer website')
    }
  })

  // Baseline security headers on every response. The API serves JSON (and one
  // checkout page that sets its own policy), so these are cheap and safe.
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff')
    reply.header('referrer-policy', 'no-referrer')
    reply.header('x-frame-options', 'DENY')
    reply.header('cross-origin-resource-policy', 'same-site')
    if (env.NODE_ENV === 'production') {
      reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains')
    }
    return payload
  })

  // The website runs on a different origin from the API. Native apps are
  // unaffected — CORS is a browser policy.
  await app.register(fastifyCors, {
    origin: env.NODE_ENV === 'production' ? corsOrigins() : true,
    credentials: false,
    allowedHeaders: ['content-type', 'authorization', 'idempotency-key', 'if-none-match', 'x-razorpay-signature', 'x-razorpay-event-id'],
    exposedHeaders: ['etag'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  await app.register(fastifyJwt, { secret: env.JWT_SECRET })
  await registerRealtimeGateway(app)

  registerAuthRoutes(app)
  registerUserRoutes(app)
  registerTripRoutes(app)
  registerSafetyRoutes(app)
  registerAdminOpsRoutes(app)
  registerVaultRoutes(app)
  registerKycRoutes(app)
  registerPaymentRoutes(app)
  registerCatalogueRoutes(app)
  registerLocationRoutes(app)
  registerTelemetryRoutes(app)

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

  app.get('/metrics', async (request, reply) => {
    if (env.METRICS_TOKEN && request.headers.authorization !== `Bearer ${env.METRICS_TOKEN}`) {
      return reply.status(401).send({ error: { code: 'UNAUTHENTICATED', message: 'Metrics require a token' } })
    }
    return reply.type('text/plain; version=0.0.4').send(renderMetrics())
  })

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
