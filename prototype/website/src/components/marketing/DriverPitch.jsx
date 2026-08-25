import { BadgeCheck, TrendingUp, ShieldCheck, IndianRupee } from 'lucide-react'
import Reveal from './Reveal.jsx'

const PERKS = [
  { icon: BadgeCheck, title: 'Earn a trusted badge', description: 'MD certification puts you in the top 5% of drivers and unlocks premium Lux and Night fares.' },
  { icon: TrendingUp, title: 'Score-based rewards', description: 'Telematics scoring rewards smooth driving. Higher scores mean lower commission and priority dispatch.' },
  { icon: ShieldCheck, title: 'You are protected too', description: 'Trip evidence guards you against false accusations. Every ride is witnessed by the vault.' },
  { icon: IndianRupee, title: 'Weekly payouts', description: 'Transparent earnings with weekly settlement, fuel card options and insurance support.' },
]

export default function DriverPitch() {
  return (
    <section id="drivers" className="bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <p className="text-sm font-bold uppercase tracking-widest text-brand-600">For drivers</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
              Professionalism, finally rewarded.
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              MyDriver is built for drivers who take pride in the craft. Get verified, drive safe, and earn more for it.
            </p>
            <button
              type="button"
              className="mt-8 rounded-full bg-brand-500 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-500/25 transition-colors hover:bg-brand-600"
            >
              Apply to drive
            </button>
          </Reveal>

          <ul className="grid gap-4 sm:grid-cols-2">
            {PERKS.map((perk, i) => (
              <Reveal as="li" key={perk.title} delay={i * 100} className="rounded-3xl border border-slate-200 bg-white p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <perk.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-bold text-slate-900">{perk.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{perk.description}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
