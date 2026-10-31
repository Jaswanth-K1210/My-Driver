import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { useAuth } from './context/authStore.js'
import { ToastProvider } from './context/ToastContext.jsx'
import { TripProvider } from './context/TripContext.jsx'
import DashboardLayout from './components/app/DashboardLayout.jsx'
import { ScrollManager } from './components/marketing/Navbar.jsx'
import Landing from './pages/Landing.jsx'
import { RequireAuth, SessionLoading } from './routing.jsx'

// The customer website. The admin portal is a separate build (AdminApp.jsx)
// served on its own subdomain: none of its code is in this bundle.

// Only the landing page is in the first download. Sign-in and dashboard pages
// load when visited, and Leaflet only with Track and the guardian page.
const Login = lazy(() => import('./pages/Login.jsx'))
const Register = lazy(() => import('./pages/Register.jsx'))
const Overview = lazy(() => import('./pages/dashboard/Overview.jsx'))
const Book = lazy(() => import('./pages/dashboard/Book.jsx'))
const Track = lazy(() => import('./pages/dashboard/Track.jsx'))
const Vault = lazy(() => import('./pages/dashboard/Vault.jsx'))
const Profile = lazy(() => import('./pages/dashboard/Profile.jsx'))
const GuardianTrack = lazy(() => import('./pages/GuardianTrack.jsx'))

/** Keeps signed-in users out of the auth screens, sending them where they were headed. */
function RedirectIfAuthed({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()
  if (loading) return <SessionLoading />
  if (isAuthenticated) return <Navigate to={location.state?.from ?? '/app'} replace />
  return children
}

export default function CustomerApp() {
  return (
    <BrowserRouter>
      <ScrollManager />
      <ToastProvider>
        <AuthProvider>
          <TripProvider>
            <Suspense fallback={<SessionLoading />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
                <Route path="/register" element={<RedirectIfAuthed><Register /></RedirectIfAuthed>} />
                {/* Public: guardians open this from a texted link, no account. */}
                <Route path="/track/:token" element={<GuardianTrack />} />
                <Route path="/app" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
                  <Route index element={<Overview />} />
                  <Route path="book" element={<Book />} />
                  <Route path="track" element={<Track />} />
                  <Route path="vault" element={<Vault />} />
                  <Route path="profile" element={<Profile />} />
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
