import { Check } from 'lucide-react'
import Reveal from './Reveal.jsx'
import { PRICING } from '../../data/mock.js'
import { cn } from '../../lib/utils.js'

export default function Pricing() {
  return (
    <section id="pricing" className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-600">Pricing</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Safety included. Always.</h2>
          <p className="mt-4 text-lg text-slate-600">
            Every plan carries the full verification, ceiling and vault stack. Pay only for the class of ride.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {PRICING.map((plan, i) => (
            <Reveal
              as="article"
              key={plan.name}
              delay={i * 110}
              className={cn(
                'relative flex flex-col rounded-[2rem] border p-8',
                plan.featured
                  ? 'border-brand-500 bg-white shadow-2xl shadow-brand-500/10 ring-1 ring-brand-500 lg:-my-3'
                  : 'border-slate-200 bg-white',
              )}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-500 px-3.5 py-1 text-[11px] font-black uppercase tracking-wide text-white">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{plan.blurb}</p>
              <p className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-black tracking-tight text-slate-900">{plan.price}</span>
                <span className="text-sm text-slate-500">{plan.unit} per km</span>
              </p>
              <ul className="mt-7 flex-1 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
                    <span className="text-slate-600">{feature}</span>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={cn(
                  'mt-9 rounded-full px-5 py-3.5 text-sm font-bold transition-colors',
                  plan.featured
                    ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25 hover:bg-brand-600'
                    : 'border border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                {plan.cta}
              </button>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
