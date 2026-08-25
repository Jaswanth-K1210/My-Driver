/** Backend base URL. Override with VITE_API_URL in .env. */
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

/** Google Web client ID. Blank disables the Google sign-in button. */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

export const GOOGLE_ENABLED = GOOGLE_CLIENT_ID.length > 0

/**
 * Features the Phase 1 backend does not implement yet. Anything listed here is
 * rendered with a visible "Demo" marker so simulated data is never mistaken
 * for real data.
 *   - inspection / vault certificates -> Trip Vault, Phase 3
 *   - sos / guardian dispatch / breach alerts -> escalation + integrity, Phase 2
 *   - visioncam -> permanently excluded from this backend
 */
export const DEMO_FEATURES = {
  inspection: true,
  certificate: true,
  sos: true,
  guardianDispatch: true,
  breachAlerts: true,
  visionCam: true,
}
