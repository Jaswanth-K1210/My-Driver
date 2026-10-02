import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  BadgeCheck, Banknote, LogOut, MapPinned, Menu, Moon, PhoneCall, Radio, ScrollText, UserRoundCheck, X,
} from 'lucide-react'
import { Wordmark } from '../marketing/Navbar.jsx'
import { useAuth } from '../../context/authStore.js'
import { useToast } from '../../context/toastStore.js'
import { cn } from '../../lib/utils.js'
import { DESK_ROLES, FINANCE_ROLES, hasRole, OPS_ROLES } from './RequireRole.jsx'

/**
 * Nav is filtered by role rather than rendered-then-refused: showing an agent
 * a link that answers 403 is worse than not showing it.
 */
const NAV = [
  { to: '/admin', label: 'Live board', icon: Radio, end: true, roles: DESK_ROLES },
  { to: '/admin/map', label: 'Live map', icon: MapPinned, roles: DESK_ROLES },
  { to: '/admin/checkins', label: 'Check-ins', icon: PhoneCall, roles: DESK_ROLES },
  { to: '/admin/drivers', label: 'Drivers', icon: UserRoundCheck, roles: [...OPS_ROLES, 'SAFETY_DESK_AGENT'] },
  { to: '/admin/night-shield', label: 'Night Shield', icon: Moon, roles: [...OPS_ROLES, 'SAFETY_DESK_AGENT'] },
  { to: '/admin/grading', label: 'Grading', icon: BadgeCheck, roles: OPS_ROLES },
  { to: '/admin/payouts', label: 'Payouts', icon: Banknote, roles: FINANCE_ROLES },
  { to: '/admin/audit', label: 'Audit ledger', icon: ScrollText, roles: ['SUPER_ADMIN'] },
]

function NavItems({ user, onNavigate }) {
  return (
    <nav className="space-y-1" aria-label="Admin navigation">
      {NAV.filter((item) => hasRole(user, item.roles)).map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors',
              isActive
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            )
          }
        >
          <item.icon className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
          <span className="flex-1">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export default function AdminLayout() {
  const { user, signOut } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleSignOut = () => {
    signOut()
    toast('Signed out', 'info')
    navigate('/', { replace: true })
  }

  const identity = (
    <div className="rounded-2xl bg-slate-100 px-4 py-3">
      <p className="truncate text-sm font-bold text-slate-900">{user?.full_name ?? 'Operator'}</p>
      <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {user?.role?.replace(/_/g, ' ') ?? '—'}
      </p>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desk chrome is deliberately darker than the customer dashboard: an
          agent must never be unsure which surface they are acting on. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white p-5 lg:flex">
        <Link to="/admin" className="mb-1 flex items-center gap-2">
          <Wordmark />
        </Link>
        <p className="mb-6 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-600">
          Safety Desk
        </p>
        <NavItems user={user} />
        <div className="mt-auto space-y-2">
          {identity}
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut className="h-4.5 w-4.5" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <Link to="/admin" className="flex items-center gap-2">
          <Wordmark />
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          className="rounded-xl p-2 text-slate-600 hover:bg-slate-100"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {menuOpen && (
        <div className="border-b border-slate-200 bg-white px-4 py-4 lg:hidden">
          <NavItems user={user} onNavigate={() => setMenuOpen(false)} />
          <div className="mt-4 space-y-2">
            {identity}
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              <LogOut className="h-4.5 w-4.5" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      )}

      <main className="px-4 py-6 lg:ml-64 lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  )
}
