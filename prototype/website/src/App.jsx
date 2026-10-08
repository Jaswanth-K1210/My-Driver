import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { useAuth } from './context/authStore.js'
import { ToastProvider } from './context/ToastContext.jsx'
import { TripProvider } from './context/TripContext.jsx'
import DashboardLayout from './components/app/DashboardLayout.jsx'
import Landing from './pages/Landing.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Overview from './pages/dashboard/Overview.jsx'
import Book from './pages/dashboard/Book.jsx'
import Vault from './pages/dashboard/Vault.jsx'
import Profile from './pages/dashboard/Profile.jsx'
import RequireRole, { DESK_ROLES, FINANCE_ROLES, OPS_ROLES } from './components/admin/RequireRole.jsx'

// Staff pages and anything using Leaflet load on demand, so a customer's
// first download carries neither the admin portal nor the map library.
const Track = lazy(() => import('./pages/dashboard/Track.jsx'))
const AdminLayout = lazy(() => import('./components/admin/AdminLayout.jsx'))
const Board = lazy(() => import('./pages/admin/Board.jsx'))
const LiveMap = lazy(() => import('./pages/admin/LiveMap.jsx'))
const Incident = lazy(() => import('./pages/admin/Incident.jsx'))
const Drivers = lazy(() => import('./pages/admin/Drivers.jsx'))
const DriverDetail = lazy(() => import('./pages/admin/DriverDetail.jsx'))
const NightShield = lazy(() => import('./pages/admin/NightShield.jsx'))
const Checkins = lazy(() => import('./pages/admin/Checkins.jsx'))
const Grading = lazy(() => import('./pages/admin/Grading.jsx'))
const Payouts = lazy(() => import('./pages/admin/Payouts.jsx'))
const Payments = lazy(() => import('./pages/admin/Payments.jsx'))
const Audit = lazy(() => import('./pages/admin/Audit.jsx'))
const AdminLogin = lazy(() => import('./pages/admin/Login.jsx'))
const GuardianTrack = lazy(() => import('./pages/GuardianTrack.jsx'))

/** Shown while the stored session is being validated against the server. */
function SessionLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500" />
    </div>
  )
}

/** Sends signed-out visitors to login, remembering where they were headed. */
function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()
  // Without this gate a stored-but-unverified session flashes the login screen
  // on every page load before /v1/me answers.
  if (loading) return <SessionLoading />
  if (!isAuthenticated) {
    // Operators need the role-scoped sign-in; sending them to the customer
    // form would mint a CUSTOMER session that 403s on every admin call.
    const to = location.pathname.startsWith('/admin') ? '/admin/login' : '/login'
    return <Navigate to={to} replace state={{ from: location.pathname }} />
  }
  return children
}

/** Keeps signed-in users out of the auth screens. */
function RedirectIfAuthed({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <SessionLoading />
  if (isAuthenticated) return <Navigate to="/app" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <TripProvider>
            <Suspense fallback={<SessionLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
              {/* Public: guardians open this from a texted link, no account. */}
              <Route path="/track/:token" element={<GuardianTrack />} />
              <Route path="/register" element={<RedirectIfAuthed><Register /></RedirectIfAuthed>} />
              <Route
                path="/app"
                element={
                  <RequireAuth>
                    <DashboardLayout />
                  </RequireAuth>
                }
              >
                <Route index element={<Overview />} />
                <Route path="book" element={<Book />} />
                <Route path="track" element={<Track />} />
                <Route path="vault" element={<Vault />} />
                <Route path="profile" element={<Profile />} />
              </Route>

              {/* Operators sign in here, not at /login: the OTP challenge is
                  scoped to a role and the customer form only ever sends
                  CUSTOMER. Outside RedirectIfAuthed so a signed-in customer
                  can still reach it to sign in as an operator. */}
              <Route path="/admin/login" element={<AdminLogin />} />

              {/* Admin portal. The outer gate is DESK_ROLES so a FINANCE-only
                  account still reaches /admin/payouts through its own gate,
                  rather than being refused at the door. */}
              <Route
                path="/admin"
                element={
                  <RequireAuth>
                    <RequireRole any={[...DESK_ROLES, 'FINANCE']}>
                      <AdminLayout />
                    </RequireRole>
                  </RequireAuth>
                }
              >
                <Route index element={<RequireRole any={DESK_ROLES}><Board /></RequireRole>} />
                <Route path="map" element={<RequireRole any={DESK_ROLES}><LiveMap /></RequireRole>} />
                <Route path="incident/:id" element={<RequireRole any={DESK_ROLES}><Incident /></RequireRole>} />
                <Route path="checkins" element={<RequireRole any={DESK_ROLES}><Checkins /></RequireRole>} />
                <Route path="drivers" element={<RequireRole any={[...OPS_ROLES, 'SAFETY_DESK_AGENT']}><Drivers /></RequireRole>} />
                <Route path="drivers/:id" element={<RequireRole any={[...OPS_ROLES, 'SAFETY_DESK_AGENT']}><DriverDetail /></RequireRole>} />
                <Route path="night-shield" element={<RequireRole any={[...OPS_ROLES, 'SAFETY_DESK_AGENT']}><NightShield /></RequireRole>} />
                <Route path="grading" element={<RequireRole any={OPS_ROLES}><Grading /></RequireRole>} />
                <Route path="payouts" element={<RequireRole any={FINANCE_ROLES}><Payouts /></RequireRole>} />
                <Route path="payments" element={<RequireRole any={[...FINANCE_ROLES, 'OPS_MANAGER']}><Payments /></RequireRole>} />
                <Route path="audit" element={<RequireRole any={['SUPER_ADMIN']}><Audit /></RequireRole>} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </TripProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
