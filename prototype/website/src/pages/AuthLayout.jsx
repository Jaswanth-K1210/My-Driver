import { ShieldCheck } from 'lucide-react'
import { TRUST_MARKS } from '../data/mock.js'

/**
 * Shared sign-in layout. Each site passes its own `header`, so the customer
 * build never contains the console header and the admin build never contains
 * the customer navigation.
 */
export default function AuthLayout({ title, subtitle, children, footer, header, footnote }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {header}
      <div className="grid flex-1 lg:grid-cols-2">
      {/* Left padding matches PAGE_X, so the form lines up with the header logo. */}
      <div className="flex flex-col px-4 py-10 sm:px-6 lg:pl-[max(2rem,calc((100vw-80rem)/2+2rem))] lg:pr-16">
        <div className="flex flex-1 items-start py-4 lg:items-center lg:py-8">
          <div className="w-full max-w-md">
            <h1 className="text-3xl font-black tracking-tight text-slate-900">{title}</h1>
            <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-6 text-sm text-slate-600">{footer}</div>}
          </div>
        </div>

        <p className="text-xs text-slate-400">{footnote}</p>
      </div>

      {/* Reassurance panel. Hidden on small screens so the form stays the focus. */}
      <div className="hidden border-l border-slate-200 bg-slate-50 p-16 lg:flex lg:flex-col lg:justify-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 shadow-lg shadow-brand-500/25">
          <ShieldCheck className="h-7 w-7 text-white" aria-hidden="true" />
        </span>
        <h2 className="mt-8 max-w-sm text-3xl font-black leading-tight tracking-tight text-slate-900">
          Every trip is safe, accountable and provable.
        </h2>
        <ul className="mt-8 space-y-4">
          {TRUST_MARKS.map((mark) => (
            <li key={mark} className="flex items-center gap-3 text-sm font-semibold text-slate-700">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50">
                <ShieldCheck className="h-4 w-4 text-brand-500" aria-hidden="true" />
              </span>
              {mark}
            </li>
          ))}
        </ul>
      </div>
      </div>
    </div>
  )
}
