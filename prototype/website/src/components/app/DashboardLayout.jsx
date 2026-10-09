import { NavLink, Outlet } from 'react-router-dom'
import { Archive, CarFront, LayoutDashboard, Radio, UserRound } from 'lucide-react'
import Navbar, { PAGE_X } from '../marketing/Navbar.jsx'
import Footer from '../marketing/Footer.jsx'
import { useTrip } from '../../context/tripStore.js'
import { cn } from '../../lib/utils.js'

const TABS = [
  { to: '/app', label: 'My trips', icon: LayoutDashboard, end: true },
  { to: '/app/book', label: 'Book a driver', icon: CarFront },
  { to: '/app/track', label: 'Live trip', icon: Radio },
  { to: '/app/vault', label: 'Trip Vault', icon: Archive },
  { to: '/app/profile', label: 'Profile', icon: UserRound },
]

/**
 * Signed-in pages share the public site's header, so the logo, the section
 * links and the account controls sit in the same place on every page. The tab
 * row below it replaces the old sidebar.
 */
export default function DashboardLayout() {
  const { hasActiveTrip } = useTrip()

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Navbar />
      <div className="border-b border-slate-200 bg-white">
        <nav aria-label="Account" className={cn(PAGE_X, 'no-scrollbar flex gap-1 overflow-x-auto')}>
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-3.5 text-sm font-semibold transition-colors',
                  isActive
                    ? 'border-brand-500 text-brand-700'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900',
                )
              }
            >
              <tab.icon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
              {tab.to === '/app/track' && hasActiveTrip && (
                <span className="h-2 w-2 rounded-full bg-brand-500" aria-label="Trip in progress" />
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <main className="flex-1">
        <div className={cn(PAGE_X, 'py-8 lg:py-10')}>
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  )
}
