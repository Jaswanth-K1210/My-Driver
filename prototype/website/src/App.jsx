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
import Track from './pages/dashboard/Track.jsx'
import Vault from './pages/dashboard/Vault.jsx'
import Profile from './pages/dashboard/Profile.jsx'

/** Sends signed-out visitors to login, remembering where they were headed. */
function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return children
}

/** Keeps signed-in users out of the auth screens. */
function RedirectIfAuthed({ children }) {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return <Navigate to="/app" replace />
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <TripProvider>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
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
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </TripProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
