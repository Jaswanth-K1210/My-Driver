import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Archive, Bell, CarFront, LayoutDashboard, LogOut, Menu, Radio, UserRound, X } from 'lucide-react'
import { Wordmark } from '../marketing/Navbar.jsx'
import { useAuth } from '../../context/authStore.js'
import { useTrip } from '../../context/tripStore.js'
import { useToast } from '../../context/toastStore.js'
import { cn } from '../../lib/utils.js'

const NAV = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/book', label: 'Book a ride', icon: CarFront },
  { to: '/app/track', label: 'Live tracking', icon: Radio },
  { to: '/app/vault', label: 'Trip Vault', icon: Archive },
  { to: '/app/profile', label: 'Profile', icon: UserRound },
]

function NavItems({ onNavigate, hasActiveTrip }) {
  return (
    <nav className="space-y-1" aria-label="Dashboard navigation">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors',
              isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
            )
          }
        >
          <item.icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
          <span className="flex-1">{item.label}</span>
          {item.to === '/app/track' && hasActiveTrip && (
            <span className="flex h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-label="Trip in progress" />
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export default function DashboardLayout() {
  const { user, signOut } = useAuth()
  const { hasActiveTrip } = useTrip()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleSignOut = () => {
    signOut()
    toast('Signed out', 'info')
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-slate-200 bg-white px-5 py-6 lg:flex">
        <Link to="/" aria-label="MyDriver home" className="px-1">
          <Wordmark />
        </Link>
        <div className="mt-8 flex-1">
          <NavItems hasActiveTrip={hasActiveTrip} />
        </div>
        <div className="border-t border-slate-200 pt-4">
          <div className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-black text-brand-600">
              {user.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900">{user.name}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-brand-700"
          >
            <LogOut className="h-4.5 w-4.5" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="rounded-xl p-2 text-slate-700 transition-colors hover:bg-slate-100"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link to="/" aria-label="MyDriver home">
          <Wordmark />
        </Link>
        <button
          type="button"
          onClick={() => toast('No new alerts — all trips sealed', 'info')}
          aria-label="Notifications"
          className="relative rounded-xl p-2 text-slate-700 transition-colors hover:bg-slate-100"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden="true" />
        </button>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-slate-900/25 backdrop-blur-sm" />
          <div className="rise-in relative flex h-full w-72 max-w-[85vw] flex-col border-r border-slate-200 bg-white px-5 py-6">
            <div className="flex items-center justify-between">
              <Wordmark />
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-8 flex-1">
              <NavItems hasActiveTrip={hasActiveTrip} onNavigate={() => setMenuOpen(false)} />
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-2xl border-t border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:text-brand-700"
            >
              <LogOut className="h-4.5 w-4.5" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      )}

      <main className="lg:pl-72">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
