import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/authStore.js'

/** Shown while the stored session is being validated against the server. */
export function SessionLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500" />
    </div>
  )
}

/** Sends signed-out visitors to `loginPath`, remembering where they were headed. */
export function RequireAuth({ children, loginPath = '/login' }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()
  // Without this gate a stored-but-unverified session flashes the login screen
  // on every page load before /v1/me answers.
  if (loading) return <SessionLoading />
  if (!isAuthenticated) return <Navigate to={loginPath} replace state={{ from: location.pathname }} />
  return children
}
