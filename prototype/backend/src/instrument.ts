// Sentry: errors, crashes and sampled traces (docs/testing-plan.md §9).
// Loaded with `node --import` before the app so it can instrument http,
// Fastify and pg. Off unless SENTRY_DSN is set, so local dev and CI send nothing.
import * as Sentry from '@sentry/node'
import { env } from './config/env.js'
import { scrubSentry } from './lib/sentry-scrub.js'

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT,
    release: env.SENTRY_RELEASE,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    // Collect no bodies, cookies, query strings, SQL values or local variables
    // in the first place; scrubSentry then catches what slips through.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      urlQueryParams: false,
      httpHeaders: { request: { allow: ['user-agent', 'content-type'] }, response: false },
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    beforeSend: scrubSentry,
    beforeSendSpan: scrubSentry,
    // Telemetry arrives every few seconds per driver; probes are noise.
    ignoreSpans: [/\/telemetry$/, /^GET \/(health|ready|metrics)$/],
  })
}
