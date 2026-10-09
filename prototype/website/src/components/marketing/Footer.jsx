import { Link } from 'react-router-dom'
import { Mail, MapPin } from 'lucide-react'
import { PAGE_X, Wordmark } from './Navbar.jsx'

// Only pages and sections that exist. Nothing here links to staff tools: the
// operations portal is reached by its own internal address, never from here.
const LINK_GROUPS = [
  {
    heading: 'Product',
    links: [
      { label: 'How it works', to: { pathname: '/', hash: '#how' } },
      { label: 'Safety', to: { pathname: '/', hash: '#safety' } },
      { label: 'Driver tiers', to: { pathname: '/', hash: '#skills' } },
      { label: 'Pricing', to: { pathname: '/', hash: '#pricing' } },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Book a driver', to: '/app/book' },
      { label: 'My trips', to: '/app' },
      { label: 'Log in', to: '/login' },
      { label: 'Create an account', to: '/register' },
    ],
  },
  {
    heading: 'More',
    links: [
      { label: 'FAQ', to: { pathname: '/', hash: '#faq' } },
      { label: 'Join as a driver', to: { pathname: '/', hash: '#drivers' } },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-16 text-slate-600">
      <div className={PAGE_X}>
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Wordmark />
            <p className="mt-5 max-w-xs text-sm leading-relaxed">
              Verified drivers for your own car, with every trip tracked, inspected and on record.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm">
              <li className="flex items-center gap-2.5">
                <MapPin className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
                HITEC City, Hyderabad, TS 500081
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
                hello@mydriver.example
              </li>
            </ul>
          </div>

          {LINK_GROUPS.map((group) => (
            <nav key={group.heading} aria-label={group.heading}>
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900">{group.heading}</h3>
              <ul className="mt-5 space-y-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link to={link.to} className="text-sm transition-colors hover:text-slate-900">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-8 text-xs sm:flex-row">
          <p>© {new Date().getFullYear()} MyDriver Mobility Pvt Ltd. All rights reserved.</p>
          <p>Made in Hyderabad</p>
        </div>
      </div>
    </footer>
  )
}
