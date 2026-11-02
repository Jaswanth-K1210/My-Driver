import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, secureStorage } from '../lib/apiClient'
import { APP_ROLE } from '../lib/config'
import { classifyApiError, STORAGE_KEYS } from '../lib/onboardingGate'

const AuthCtx = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used inside an AuthProvider')
  return ctx
}

async function readCachedUser() {
  try {
    const raw = await secureStorage.get(STORAGE_KEYS.AUTH_USER)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed.id !== 'string' || parsed.role !== APP_ROLE) return null
    return parsed
  } catch {
    return null
  }
}

async function writeCachedUser(me) {
  if (!me || typeof me.id !== 'string') return
  await secureStorage.set(
    STORAGE_KEYS.AUTH_USER,
    JSON.stringify({
      id: me.id,
      role: me.role ?? APP_ROLE,
      phone_number: me.phone_number ?? null,
      full_name: me.full_name ?? null,
    }),
  )
}

async function clearStoredSessionData() {
  await Promise.all([
    secureStorage.remove(STORAGE_KEYS.AUTH_USER),
    secureStorage.remove(STORAGE_KEYS.VERIFIED_APPROVAL),
    secureStorage.remove(STORAGE_KEYS.ACTIVE_TRIP),
  ])
}

/**
 * Real session state backed by the MyDriver API.
 *
 * Tokens live in the device keychain, so the app resumes signed in. On start we
 * ask the server who we are. An explicit 401/403 revokes the session immediately,
 * while a transient network failure during startup preserves a legitimate
 * existing session so an offline driver mid-trip is never logged out.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const signOut = useCallback(async () => {
    await clearStoredSessionData()
    await api.auth.logout()
    setUser(null)
  }, [])

  const refreshMe = useCallback(async () => {
    try {
      const me = await api.me.get()
      setUser(me)
      await writeCachedUser(me)
      return me
    } catch (err) {
      const kind = classifyApiError(err)
      const hasTokens = await api.hasSession()
      if (kind === 'AUTH_INVALID' || kind === 'FORBIDDEN' || !hasTokens) {
        await clearStoredSessionData()
        if (!hasTokens || kind === 'AUTH_INVALID') {
          await api.auth.logout().catch(() => undefined)
        }
        setUser(null)
        return null
      }
      // Transient network error while a valid session token exists: preserve
      // current or cached user identity so offline active-trip continuity can work.
      const cached = await readCachedUser()
      setUser((prev) => prev ?? cached)
      return cached
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
