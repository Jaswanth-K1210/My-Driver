import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutDashboard, Menu, X } from 'lucide-react'
import { NAV_LINKS } from '../../data/mock.js'
import { useAuth } from '../../context/authStore.js'
import { cn } from '../../lib/utils.js'

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

export default function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { isAuthenticated, user } = useAuth()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300',
        scrolled || open ? 'border-slate-200 bg-white/95 backdrop-blur-md' : 'border-transparent bg-white',
      )}
    >
      <nav className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8" aria-label="Main navigation">
        <Link to="/" aria-label="MyDriver home">
          <Wordmark />
        </Link>

        <div className="hidden items-center gap-9 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          {isAuthenticated ? (
            <Link
              to="/app"
              className="flex items-center gap-2 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/25 transition-colors hover:bg-brand-600"
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              {user.initials} · Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="rounded-full px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:text-slate-900">
                Log in
              </Link>
              <Link
                to="/register"
                className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-500/25 transition-colors hover:bg-brand-600"
              >
                Create account
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
        <div className="border-t border-slate-200 bg-white px-4 pb-5 pt-3 lg:hidden">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              {link.label}
            </a>
          ))}
          <div className="mt-3 grid gap-2">
            {isAuthenticated ? (
              <Link to="/app" onClick={() => setOpen(false)} className="rounded-full bg-brand-500 px-5 py-3 text-center text-sm font-semibold text-white">
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" onClick={() => setOpen(false)} className="rounded-full border border-slate-200 px-5 py-3 text-center text-sm font-semibold text-slate-700">
                  Log in
                </Link>
                <Link to="/register" onClick={() => setOpen(false)} className="rounded-full bg-brand-500 px-5 py-3 text-center text-sm font-semibold text-white">
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
