import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'
import RequireRole, { DESK_ROLES, FINANCE_ROLES, MANAGER_ROLES, OPS_ROLES, SUPPORT_ROLES } from './components/admin/RequireRole.jsx'
import AdminLayout from './components/admin/AdminLayout.jsx'
import AdminLogin from './pages/admin/Login.jsx'
import Board from './pages/admin/Board.jsx'
import { RequireAuth, SessionLoading } from './routing.jsx'

// The operations console, built and served on its own subdomain
// (VITE_APP_TARGET=admin). It shares components and the API client with the
// customer website but none of the customer pages, and the customer build
// contains none of this.

const LiveMap = lazy(() => import('./pages/admin/LiveMap.jsx'))
const Incident = lazy(() => import('./pages/admin/Incident.jsx'))
const Drivers = lazy(() => import('./pages/admin/Drivers.jsx'))
const DriverDetail = lazy(() => import('./pages/admin/DriverDetail.jsx'))
const NightShield = lazy(() => import('./pages/admin/NightShield.jsx'))
const Checkins = lazy(() => import('./pages/admin/Checkins.jsx'))
const Grading = lazy(() => import('./pages/admin/Grading.jsx'))
const Payments = lazy(() => import('./pages/admin/Payments.jsx'))
const Payouts = lazy(() => import('./pages/admin/Payouts.jsx'))
const Audit = lazy(() => import('./pages/admin/Audit.jsx'))
const Overview = lazy(() => import('./pages/admin/Overview.jsx'))
const Trips = lazy(() => import('./pages/admin/Trips.jsx'))
const TripDetail = lazy(() => import('./pages/admin/TripDetail.jsx'))
const Customers = lazy(() => import('./pages/admin/Customers.jsx'))
const CustomerDetail = lazy(() => import('./pages/admin/CustomerDetail.jsx'))
const Pricing = lazy(() => import('./pages/admin/Pricing.jsx'))

const DRIVER_READ = [...OPS_ROLES, 'SAFETY_DESK_AGENT']

export default function AdminApp() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Suspense fallback={<SessionLoading />}>
            <Routes>
              <Route path="/login" element={<AdminLogin />} />
              {/* The outer gate admits FINANCE too, so a finance-only account
                  reaches /payouts through its own gate instead of being turned
                  away at the door. */}
              <Route
                path="/"
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
                <Route path="drivers" element={<RequireRole any={DRIVER_READ}><Drivers /></RequireRole>} />
                <Route path="drivers/:id" element={<RequireRole any={DRIVER_READ}><DriverDetail /></RequireRole>} />
                <Route path="night-shield" element={<RequireRole any={DRIVER_READ}><NightShield /></RequireRole>} />
                <Route path="grading" element={<RequireRole any={OPS_ROLES}><Grading /></RequireRole>} />
                <Route path="payments" element={<RequireRole any={[...FINANCE_ROLES, 'OPS_MANAGER']}><Payments /></RequireRole>} />
                <Route path="payouts" element={<RequireRole any={FINANCE_ROLES}><Payouts /></RequireRole>} />
                <Route path="audit" element={<RequireRole any={['SUPER_ADMIN']}><Audit /></RequireRole>} />
                <Route path="overview" element={<RequireRole any={MANAGER_ROLES}><Overview /></RequireRole>} />
                <Route path="trips" element={<RequireRole any={SUPPORT_ROLES}><Trips /></RequireRole>} />
                <Route path="trips/:id" element={<RequireRole any={SUPPORT_ROLES}><TripDetail /></RequireRole>} />
                <Route path="customers" element={<RequireRole any={SUPPORT_ROLES}><Customers /></RequireRole>} />
                <Route path="customers/:id" element={<RequireRole any={SUPPORT_ROLES}><CustomerDetail /></RequireRole>} />
                <Route path="pricing" element={<RequireRole any={MANAGER_ROLES}><Pricing /></RequireRole>} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
