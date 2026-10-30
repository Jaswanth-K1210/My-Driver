// Sentry: errors and sampled traces (docs/testing-plan.md §9). Off unless
// EXPO_PUBLIC_SENTRY_DSN is set and the app is running in a development,
// preview, or production build (not Expo Go).
import Constants from 'expo-constants'
import * as Sentry from '@sentry/react-native'
import { scrubSentry } from './sentry-scrub'

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim() || ''
const isExpoGo = Constants.executionEnvironment === 'storeClient'
export const sentryEnabled = Boolean(dsn) && !isExpoGo

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT?.trim() || 'local',
    release: process.env.EXPO_PUBLIC_SENTRY_RELEASE?.trim() || undefined,
    tracesSampleRate: Number(process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || 0.1),
    sendDefaultPii: false,
    initialScope: { tags: { app: 'customer' } },
    beforeSend: scrubSentry,
    beforeSendSpan: scrubSentry,
  })
}

/** Tags events with the signed-in user's ID so triage can filter one tester. */
export function setTester(id) {
  if (!sentryEnabled) return
  Sentry.setTag('tester', id ?? undefined)
}

/** Wraps the root App component only when Sentry is active. */
export function wrapApp(Component) {
  return sentryEnabled ? Sentry.wrap(Component) : Component
}
