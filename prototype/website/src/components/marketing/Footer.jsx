import { Phone, Mail, MapPin } from 'lucide-react'
import { Wordmark } from './Navbar.jsx'

const LINK_GROUPS = [
  { heading: 'Product', links: ['Customer app', 'Driver app', 'Safety Desk', 'Trip Vault'] },
  { heading: 'Company', links: ['About', 'Careers', 'Press kit', 'Contact'] },
  { heading: 'Trust', links: ['Safety centre', 'Privacy policy', 'Terms of service', 'Grievance officer'] },
]

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white py-16 text-slate-600">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Wordmark />
            <p className="mt-5 max-w-xs text-sm leading-relaxed">
              India&apos;s first end-to-end driver integrity infrastructure. Certified drivers, enforced ceilings,
              provable trips.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm">
              <li className="flex items-center gap-2.5">
                <MapPin className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
                HITEC City, Hyderabad, TS 500081
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
                Safety Desk: 1800-MY-DRIVER (demo)
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
                  <li key={link}>
                    <span className="cursor-default text-sm transition-colors hover:text-slate-900">{link}</span>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-8 text-xs sm:flex-row">
          <p>© 2026 MyDriver Mobility Pvt Ltd. Prototype — mock data only.</p>
          <p>Made for the MyDriver product team.</p>
        </div>
      </div>
    </footer>
  )
}
