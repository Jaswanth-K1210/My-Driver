import Constants from 'expo-constants'

/**
 * Expo Go runs on a phone, where "localhost" is the phone itself — not the
 * machine running the backend. The Expo dev server already knows the host
 * machine's LAN address, so derive the API URL from it. That makes the app
 * work on a real device with no hand-edited IP.
 *
 * Override explicitly with EXPO_PUBLIC_API_URL when needed (tunnels, staging).
 */
function inferredApiUrl() {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    Constants.expoGoConfig?.debuggerHost ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost

  if (!hostUri) return null
  const host = String(hostUri).split(':')[0]
  if (!host) return null
  return `http://${host}:4000`
}

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? inferredApiUrl() ?? 'http://localhost:4000'

/** This app only ever authenticates in one role. */
export const APP_ROLE = 'CUSTOMER'

/** Google OAuth client ID for this platform. Blank disables the Google button. */
export const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? ''
export const GOOGLE_ENABLED = GOOGLE_CLIENT_ID.length > 0

/**
 * Screens with no Phase 1 backend behind them. Anything true here renders a
 * visible "Demo" marker so simulated data is never taken for real data.
 *   inspection / certificate -> Trip Vault, Phase 3
 *   sos / guardianDispatch / breachAlerts -> escalation + integrity, Phase 2
 *   visionCam -> permanently excluded from this backend
 */
export const DEMO_FEATURES = {
  inspection: true,
  certificate: true,
  sos: true,
  guardianDispatch: true,
  breachAlerts: true,
  visionCam: true,
}
