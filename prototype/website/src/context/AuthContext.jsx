import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './authStore.js'
import { api } from '../lib/apiClient.js'
import { initialsOf } from '../lib/utils.js'

/**
 * Real session state backed by the MyDriver API.
 *
 * Tokens live in localStorage (written by the API client), so a refresh keeps
 * you signed in. On mount we ask the server who we are rather than trusting a
 * cached user object — that way a revoked or expired session is caught
 * immediately instead of showing a stale identity.
 */

/** Shapes the API user into what the dashboard screens already render. */
function toViewUser(me) {
  if (!me) return null
  const name = me.full_name || me.phone_number || 'MyDriver rider'
  return {
    id: me.id,
    name,
    email: me.email ?? '',
    phone: me.phone_number ?? '',
    role: me.role,
    roles: me.roles ?? [],
    initials: initialsOf(name),
    memberSince: new Date().getFullYear().toString(),
    rating: 5.0,
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshMe = useCallback(async () => {
    try {
      const me = await api.me.get()
      setUser(toViewUser(me))
      return me
    } catch {
      setUser(null)
      return null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!(await api.hasSession())) {
        if (!cancelled) setLoading(false)
        return
      }
      await refreshMe()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [refreshMe])

  /** Step 1 of login: ask the server to text a 6-digit code. */
  const requestOtp = useCallback((phone) => api.auth.requestOtp(phone, 'CUSTOMER'), [])

  /** Step 2: exchange the code for a session. */
  const verifyOtp = useCallback(
    async (phone, code, profile) => {
      const res = await api.auth.verifyOtp(phone, code, 'CUSTOMER')
      // A new signup carries a name/email the server does not have yet.
      if (profile && (profile.name || profile.email)) {
        try {
          await api.me.update({
            ...(profile.name ? { full_name: profile.name } : {}),
            ...(profile.email ? { email: profile.email } : {}),
          })
        } catch {
          // A duplicate email must not block an otherwise valid login.
        }
      }
      const me = await refreshMe()
      return me ?? res.user
    },
    [refreshMe],
  )

  const signInWithGoogle = useCallback(
    async (idToken) => {
      await api.auth.google(idToken, 'CUSTOMER')
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
