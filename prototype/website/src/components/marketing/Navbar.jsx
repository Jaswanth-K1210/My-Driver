import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Archive, ChevronDown, LogOut, Menu, UserRound, X } from 'lucide-react'
import { NAV_LINKS } from '../../data/mock.js'
import { useAuth } from '../../context/authStore.js'
import { useToast } from '../../context/toastStore.js'
import { cn } from '../../lib/utils.js'

/** One horizontal frame for every page, so header, content and footer edges line up. */
export const PAGE_X = 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8'

export function Wordmark({ className }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-base font-black text-white">
        M
      </span>
      <span className="text-lg font-bold tracking-tight text-slate-900">
        My<span className="text-brand-600">Driver</span>
      </span>
    </span>
  )
}

const btnPrimary =
  'inline-flex h-10 items-center justify-center rounded-full bg-brand-500 px-5 text-sm font-semibold text-white shadow-sm shadow-brand-500/25 transition-colors hover:bg-brand-600'
const btnQuiet =
  'inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900'

function AccountMenu({ user, onSignOut }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const item = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 pl-1 pr-3 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-300"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-black text-brand-600">
          {user.initials}
        </span>
        <span className="max-w-[8rem] truncate">{user.name}</span>
        <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 w-60 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
          <div className="px-3 pb-2 pt-1">
            <p className="truncate text-sm font-bold text-slate-900">{user.name}</p>
            {user.email && <p className="truncate text-xs text-slate-500">{user.email}</p>}
          </div>
          <div className="my-1 h-px bg-slate-100" />
          <Link role="menuitem" to="/app/profile" onClick={() => setOpen(false)} className={item}>
            <UserRound className="h-4 w-4 text-slate-400" aria-hidden="true" /> Profile
          </Link>
          <Link role="menuitem" to="/app/vault" onClick={() => setOpen(false)} className={item}>
            <Archive className="h-4 w-4 text-slate-400" aria-hidden="true" /> Trip Vault
          </Link>
          <div className="my-1 h-px bg-slate-100" />
          <button role="menuitem" type="button" onClick={onSignOut} className={cn(item, 'hover:text-brand-700')}>
            <LogOut className="h-4 w-4 text-slate-400" aria-hidden="true" /> Log out
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * The one header on every customer-facing page: public site, log in, sign up
 * and the signed-in pages. Only the right-hand side changes with sign-in.
 *
 * "Book a driver" and "My trips" point at /app routes; RequireAuth sends a
 * signed-out visitor to log in and back again, so the gate lives in one place.
 */
export default function Navbar() {
  const [open, setOpen] = useState(false)
  const { isAuthenticated, user, signOut } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  // Close the phone menu on any navigation.
  useEffect(() => setOpen(false), [location.pathname, location.hash])

  const handleSignOut = async () => {
    await signOut()
    toast('You are logged out', 'info')
    navigate('/', { replace: true })
  }

  const sectionLink = 'text-sm font-medium text-slate-600 transition-colors hover:text-slate-900'

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <nav className={cn(PAGE_X, 'flex h-16 items-center justify-between gap-6')} aria-label="Main navigation">
        <Link to="/" aria-label="MyDriver home" className="shrink-0">
          <Wordmark />
        </Link>

        <div className="hidden items-center gap-8 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.hash} to={{ pathname: '/', hash: link.hash }} className={sectionLink}>
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          {isAuthenticated ? (
            <>
              <NavLink to="/app" end className={({ isActive }) => cn(btnQuiet, isActive && 'text-brand-700')}>
                My trips
              </NavLink>
              <Link to="/app/book" className={btnPrimary}>
                Book a driver
              </Link>
              <AccountMenu user={user} onSignOut={handleSignOut} />
            </>
          ) : (
            <>
              <Link to="/login" state={{ from: location.pathname.startsWith('/app') ? location.pathname : '/app' }} className={btnQuiet}>
                Log in
              </Link>
              <Link to="/app/book" className={btnPrimary}>
                Book a driver
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="rounded-xl p-2 text-slate-700 transition-colors hover:bg-slate-100 lg:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-slate-200 bg-white lg:hidden">
          <div className={cn(PAGE_X, 'pb-5 pt-3')}>
            {NAV_LINKS.map((link) => (
              <Link
                key={link.hash}
                to={{ pathname: '/', hash: link.hash }}
                className="block rounded-xl px-3 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
              {isAuthenticated ? (
                <>
                  <p className="px-3 pb-1 text-xs font-semibold text-slate-500">Signed in as {user.name}</p>
                  <Link to="/app/book" className={cn(btnPrimary, 'h-11')}>Book a driver</Link>
                  <Link to="/app" className="rounded-xl px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">My trips</Link>
                  <Link to="/app/vault" className="rounded-xl px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Trip Vault</Link>
                  <Link to="/app/profile" className="rounded-xl px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Profile</Link>
                  <button type="button" onClick={handleSignOut} className="rounded-xl px-3 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    Log out
                  </button>
                </>
              ) : (
                <>
                  <Link to="/app/book" className={cn(btnPrimary, 'h-11')}>Book a driver</Link>
                  <Link to="/login" className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 text-sm font-semibold text-slate-700">
                    Log in
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

/**
 * Scrolls to `#section` when arriving from another page, and to the top on a
 * plain page change. Mounted once inside the router.
 */
export function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      // Wait a frame so the target page has rendered its sections.
      requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }))
    } else {
      window.scrollTo(0, 0)
    }
  }, [pathname, hash])
  return null
}
