// Sentry: errors and sampled traces (docs/testing-plan.md §9). Off unless
// VITE_SENTRY_DSN is set at build time, so local dev and CI send nothing.
// Loaded on demand: the SDK is ~150 kB and stays out of the first download.
// Uncaught errors reach it through window.onerror (the site has no error boundaries).
import { scrubSentry } from './sentry-scrub.js'

const env = import.meta.env

const sentry = env.VITE_SENTRY_DSN
  ? import('@sentry/react').then(({ init, browserTracingIntegration, setTag }) => {
      init({
        dsn: env.VITE_SENTRY_DSN,
        environment: env.VITE_SENTRY_ENVIRONMENT || 'local',
        release: env.VITE_SENTRY_RELEASE || undefined,
        integrations: [browserTracingIntegration()],
        tracesSampleRate: Number(env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0.1),
        initialScope: { tags: { app: env.VITE_APP_TARGET === 'admin' ? 'console' : 'website' } },
        // Collect no bodies, cookies or query strings; scrubSentry catches the rest.
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpBodies: [],
          urlQueryParams: false,
          httpHeaders: false,
        },
        beforeSend: scrubSentry,
        beforeSendSpan: scrubSentry,
      })
      return setTag
    })
  : null

/** Tags events with the signed-in user's ID so triage can filter one tester. */
export const setTester = (id) => sentry?.then((setTag) => setTag('tester', id ?? undefined))
