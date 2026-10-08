import { Link } from 'react-router-dom'
import { Mail, MapPin } from 'lucide-react'
import { Wordmark } from './Navbar.jsx'

// Only pages and sections that exist. A footer link that goes nowhere reads as
// an unfinished site.
const LINK_GROUPS = [
  {
    heading: 'Product',
    links: [
      { label: 'How it works', href: '/#how' },
      { label: 'Safety', href: '/#safety' },
      { label: 'Driver tiers', href: '/#skills' },
      { label: 'Pricing', href: '/#pricing' },
    ],
  },
  {
    heading: 'Account',
    links: [
      { label: 'Book a driver', to: '/app/book' },
      { label: 'Sign in', to: '/login' },
      { label: 'Create an account', to: '/register' },
      { label: 'Drive with MyDriver', href: '/#drivers' },
    ],
  },
  {
    heading: 'Help',
    links: [
      { label: 'FAQ', href: '/#faq' },
      { label: 'Operator sign-in', to: '/admin/login' },
    ],
  },
]

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-16 text-slate-600">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
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
                    {link.to ? (
                      <Link to={link.to} className="text-sm transition-colors hover:text-slate-900">
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href} className="text-sm transition-colors hover:text-slate-900">
                        {link.label}
                      </a>
                    )}
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
