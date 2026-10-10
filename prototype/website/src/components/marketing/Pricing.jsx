import { Check } from 'lucide-react'
import Reveal from './Reveal.jsx'
import { PAGE_X } from './Navbar.jsx'
import SectionHeading from './SectionHeading.jsx'
import { PRICING } from '../../data/mock.js'
import { cn } from '../../lib/utils.js'
import { useTrip } from '../../context/tripStore.js'

export default function Pricing() {
  // Prices come from the live rate cards; the lowest rate of the plan's tiers.
  const { skills } = useTrip()
  const priceOf = (plan) => {
    if (!plan.rateFrom) return plan.price
    const rates = skills.filter((s) => plan.rateFrom.includes(s.id)).map((s) => s.rate)
    return rates.length ? `₹${Math.min(...rates)}` : plan.price
  }
  return (
    <section id="pricing" className="bg-white py-20 sm:py-28">
      <div className={PAGE_X}>
        <SectionHeading eyebrow="Pricing" title="Safety included. Always.">Every tier includes verified drivers, a speed limit and the Trip Vault. You pay for the kind of driver you need.</SectionHeading>

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
                <span className="text-4xl font-black tracking-tight text-slate-900">{priceOf(plan)}</span>
                <span className="text-sm text-slate-500">{plan.rateFrom ? (plan.rateFrom.length > 1 ? 'from, per km' : 'per km') : ''}</span>
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
