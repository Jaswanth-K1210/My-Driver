import { useEffect, useRef, useState } from 'react'
import { GOOGLE_CLIENT_ID, GOOGLE_ENABLED } from '../../lib/config.js'
import { useToast } from '../../context/toastStore.js'

const GSI_SRC = 'https://accounts.google.com/gsi/client'

/** Loads Google Identity Services once, shared across mounts. */
let gsiPromise = null
function loadGsi() {
  if (gsiPromise) return gsiPromise
  gsiPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google)
    const script = document.createElement('script')
    script.src = GSI_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve(window.google)
    script.onerror = () => reject(new Error('Could not load Google Identity Services'))
    document.head.appendChild(script)
  })
  return gsiPromise
}

/**
 * Renders Google's own sign-in button and hands the resulting id_token to
 * `onToken`. The backend verifies that token against Google's JWKS, so the
 * client ID here must also be listed in the backend's GOOGLE_CLIENT_IDS.
 *
 * Renders nothing when VITE_GOOGLE_CLIENT_ID is unset, so the app works
 * end-to-end on phone OTP alone.
 */
export default function GoogleButton({ label, onToken }) {
  const holder = useRef(null)
  const [failed, setFailed] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (!GOOGLE_ENABLED || !holder.current) return
    let cancelled = false

    loadGsi()
      .then((google) => {
        if (cancelled || !holder.current) return
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: async (response) => {
            try {
              await onToken(response.credential)
            } catch (err) {
              toast(err?.message ?? 'Google sign-in failed', 'warning')
            }
          },
        })
        google.accounts.id.renderButton(holder.current, {
          theme: 'outline',
          size: 'large',
          width: 320,
          text: 'continue_with',
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [onToken, toast])

  if (!GOOGLE_ENABLED) return null

  return (
    <div className="mt-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">or</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <div ref={holder} className="flex justify-center" aria-label={label} />
      {failed && (
        <p className="mt-2 text-center text-xs text-slate-500">
          Google sign-in is unavailable right now — use your mobile number.
        </p>
      )}
    </div>
  )
}
