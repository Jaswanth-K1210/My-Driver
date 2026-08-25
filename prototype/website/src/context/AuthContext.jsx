import { useCallback, useEffect, useMemo, useState } from 'react'
import { AuthContext } from './authStore.js'
import { initialsOf } from '../lib/utils.js'

const STORAGE_KEY = 'mydriver.session'

/**
 * Frontend-only auth. Sessions are held in localStorage so a refresh keeps you
 * signed in; there is no server and no password is ever stored or checked.
 * Swap `signIn` / `signUp` for real API calls when the backend lands.
 */
function readStoredUser() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser)

  useEffect(() => {
    try {
      if (user) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
      else window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Private-mode browsers can reject writes; the session just won't persist.
    }
  }, [user])

  const signIn = useCallback(({ email }) => {
    const handle = email.split('@')[0].replace(/[._-]+/g, ' ')
    const name = handle.replace(/\b\w/g, (c) => c.toUpperCase())
    const next = { name, email, initials: initialsOf(name), memberSince: '2024', rating: 4.9 }
    setUser(next)
    return next
  }, [])

  const signUp = useCallback(({ name, email, phone }) => {
    const next = { name, email, phone, initials: initialsOf(name), memberSince: '2026', rating: 5.0 }
    setUser(next)
    return next
  }, [])

  const signOut = useCallback(() => setUser(null), [])

  const value = useMemo(
    () => ({ user, isAuthenticated: Boolean(user), signIn, signUp, signOut }),
    [user, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

