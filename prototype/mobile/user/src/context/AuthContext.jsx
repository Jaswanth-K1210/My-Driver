import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/apiClient'
import { APP_ROLE } from '../lib/config'

const AuthCtx = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider')
  return ctx
}

/**
 * Real session state backed by the MyDriver API.
 *
 * Tokens live in the device keychain, so the app resumes signed in. On start we
 * ask the server who we are rather than trusting a cached user — a revoked
 * session is then caught immediately instead of showing a stale identity.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshMe = useCallback(async () => {
    try {
      const me = await api.me.get()
      setUser(me)
      return me
    } catch {
      setUser(null)
      return null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (await api.hasSession()) await refreshMe()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [refreshMe])

  const requestOtp = useCallback((phone) => api.auth.requestOtp(phone, APP_ROLE), [])

  const verifyOtp = useCallback(
    async (phone, code, profile) => {
      await api.auth.verifyOtp(phone, code, APP_ROLE)
      if (profile?.name || profile?.email) {
        try {
          await api.me.update({
            ...(profile.name ? { full_name: profile.name } : {}),
            ...(profile.email ? { email: profile.email } : {}),
          })
        } catch {
          // A duplicate email must not block an otherwise valid login.
        }
      }
      return refreshMe()
    },
    [refreshMe],
  )

  const signInWithGoogle = useCallback(
    async (idToken) => {
      await api.auth.google(idToken, APP_ROLE)
      return refreshMe()
    },
    [refreshMe],
  )

  const signOut = useCallback(async () => {
    await api.auth.logout()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      requestOtp,
      verifyOtp,
      signInWithGoogle,
      signOut,
      refreshMe,
    }),
    [user, loading, requestOtp, verifyOtp, signInWithGoogle, signOut, refreshMe],
  )

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
