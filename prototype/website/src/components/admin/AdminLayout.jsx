import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  ArrowUpRight, BadgeCheck, Banknote, BarChart3, CreditCard, FlaskConical, LogOut, Route, Tags, UsersRound, MapPinned, Menu, Moon, PhoneCall, Radio, ScrollText, UserRoundCheck, X,
} from 'lucide-react'
import { Wordmark } from '../marketing/Navbar.jsx'
import { useAuth } from '../../context/authStore.js'
import { useToast } from '../../context/toastStore.js'
import { cn } from '../../lib/utils.js'
import { DESK_ROLES, FINANCE_ROLES, hasRole, MANAGER_ROLES, OPS_ROLES, SUPPORT_ROLES } from './RequireRole.jsx'
import { api } from '../../lib/apiClient.js'
import { PromptHost } from './PromptDialog.jsx'
import { PUBLIC_SITE_URL } from '../../lib/config.js'

/**
 * Nav is filtered by role rather than rendered-then-refused: showing an agent
 * a link that answers 403 is worse than not showing it.
 */
const NAV = [
  { to: '/overview', label: 'Overview', icon: BarChart3, roles: MANAGER_ROLES },
  { to: '/', label: 'Live board', icon: Radio, end: true, roles: DESK_ROLES },
  { to: '/trips', label: 'Trips', icon: Route, roles: SUPPORT_ROLES },
  { to: '/customers', label: 'Customers', icon: UsersRound, roles: SUPPORT_ROLES },
  { to: '/map', label: 'Live map', icon: MapPinned, roles: DESK_ROLES },
  { to: '/checkins', label: 'Check-ins', icon: PhoneCall, roles: DESK_ROLES },
  { to: '/drivers', label: 'Drivers', icon: UserRoundCheck, roles: [...OPS_ROLES, 'SAFETY_DESK_AGENT'] },
  { to: '/night-shield', label: 'Night Shield', icon: Moon, roles: [...OPS_ROLES, 'SAFETY_DESK_AGENT'] },
  { to: '/grading', label: 'Grading', icon: BadgeCheck, roles: OPS_ROLES },
  { to: '/payments', label: 'Payments', icon: CreditCard, roles: [...FINANCE_ROLES, 'OPS_MANAGER'] },
  { to: '/payouts', label: 'Payouts', icon: Banknote, roles: FINANCE_ROLES },
  { to: '/pricing', label: 'Pricing', icon: Tags, roles: MANAGER_ROLES },
  { to: '/audit', label: 'Audit ledger', icon: ScrollText, roles: ['SUPER_ADMIN'] },
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
  // Shown on every page so demo records are never mistaken for real ones.
  const [demoVisible, setDemoVisible] = useState(false)
  useEffect(() => {
    api.admin.settings().then((s) => setDemoVisible(s.demo_data_visible)).catch(() => {})
  }, [])

  const handleSignOut = () => {
    signOut()
    toast('Signed out', 'info')
    navigate('/login', { replace: true })
  }

  const identity = (
    <div className="rounded-2xl bg-slate-100 px-4 py-3">
      <p className="truncate text-sm font-bold text-slate-900">{user?.name ?? 'Operator'}</p>
      <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {user?.role?.replace(/_/g, ' ') ?? '—'}
      </p>
    </div>
  )

  // The customer site is another domain now, so this is a plain link (opened
  // in a new tab) and only shown when that address is configured.
  const publicSite = PUBLIC_SITE_URL ? (
    <a
      href={PUBLIC_SITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
    >
      <ArrowUpRight className="h-4.5 w-4.5" aria-hidden="true" />
      Public website
    </a>
  ) : null

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desk chrome is deliberately darker than the customer dashboard: an
          agent must never be unsure which surface they are acting on. */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white p-5 lg:flex">
        <Link to="/" className="mb-1 flex items-center gap-2">
          <Wordmark />
        </Link>
        <p className="mb-6 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-600">
          Operations console
        </p>
        <NavItems user={user} />
        <div className="mt-auto space-y-2">
          {publicSite}
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
        <Link to="/" className="flex items-center gap-2">
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
            {publicSite}
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
        <div className="mx-auto max-w-6xl">
          {demoVisible && (
            <p className="mb-6 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900">
              <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
              Demo data is visible. Demo customers, drivers and trips are mixed into every list. Set ADMIN_DEMO_DATA=hide to remove them.
            </p>
          )}
          <Outlet />
        </div>
      </main>
      <PromptHost />
    </div>
  )
}
