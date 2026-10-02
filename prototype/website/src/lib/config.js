/** Backend base URL. Override with VITE_API_URL in .env. */
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

/** Google Web client ID. Blank disables the Google sign-in button. */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''

export const GOOGLE_ENABLED = GOOGLE_CLIENT_ID.length > 0

/**
 * Features the backend does not implement. Anything listed here is rendered
 * with a visible "Demo" marker so simulated data is never mistaken for real.
 *   - visioncam -> permanently excluded from this backend
 */
export const DEMO_FEATURES = {
  visionCam: true,
}
