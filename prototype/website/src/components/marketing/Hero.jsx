import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Clock3, MapPin, ShieldCheck, Star } from 'lucide-react'
import { HERO_WORDS, STATS, TRUST_MARKS } from '../../data/mock.js'
import { useTrip } from '../../context/tripStore.js'
import { DEFAULT_CONFIG, quoteFor } from '../../lib/booking.js'
import { formatINR } from '../../lib/utils.js'
import { DropPicker, PackagePicker, PickupField, SkillPicker, TimePicker } from '../app/BookingFields.jsx'
import { Segmented } from '../app/Primitives.jsx'

function KineticWord() {
  // Words share one grid cell and are staggered by a quarter of the 8s cycle,
  // so the cell auto-sizes to the widest word and the line never reflows.
  return (
    <span className="word-cycle inline-grid align-bottom text-brand-500">
      {HERO_WORDS.map((word, i) => (
        <span
          key={word}
          aria-hidden="true"
          className="word-cycle-item col-start-1 row-start-1 text-left"
          style={{ animationDelay: `${i * 2}s` }}
        >
          {word}
        </span>
      ))}
      <span className="sr-only">{HERO_WORDS.join(', ')}</span>
    </span>
  )
}

const MODES = [
  { id: 'location', label: 'By location', icon: MapPin },
  { id: 'hour', label: 'By hour', icon: Clock3 },
]

/**
 * Full booking configurator shown in the hero. It seeds the same config shape
 * the dashboard uses, and hands it to /app/book on submit so nothing is retyped.
 */
function HeroBooking() {
  const navigate = useNavigate()
  const { setConfig: setTripConfig } = useTrip()
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const quote = quoteFor(config)
  const set = (patch) => setConfig((prev) => ({ ...prev, ...patch }))

  const submit = (e) => {
    e.preventDefault()
    // Hand the configuration to the shared trip store so /app/book opens
    // pre-filled — and so a signed-out visitor still has it after logging in.
    setTripConfig(config)
    navigate('/app/book')
  }

  return (
    <form
      onSubmit={submit}
      className="w-full rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-900/10 sm:p-8"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-black tracking-tight text-slate-900">Book a driver</h2>
        <span className="rounded-full bg-brand-50 px-3 py-1.5 text-[11px] font-bold text-brand-700">
          Fare locked upfront
        </span>
      </div>

      <Segmented
        className="mt-5"
        size="lg"
        options={MODES}
        value={config.mode}
        onChange={(mode) => set({ mode })}
      />

      <div className="mt-4 space-y-3">
        <PickupField size="lg" />

        {config.mode === 'location' ? (
          <DropPicker size="lg" value={config.dropId} onChange={(dropId) => set({ dropId })} />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">How long do you need a driver?</p>
            <PackagePicker value={config.packageId} onChange={(packageId) => set({ packageId })} />
          </div>
        )}

        <TimePicker size="lg" value={config.pickupTime} onChange={(pickupTime) => set({ pickupTime })} />

        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">Skill certification</p>
          <SkillPicker value={config.skillId} onChange={(skillId) => set({ skillId })} />
        </div>
      </div>

      <div className="mt-5 flex items-end justify-between gap-4 border-t border-slate-200 pt-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Estimated fare</p>
          <p className="mt-0.5 text-3xl font-black tracking-tight text-slate-900">
            {quote.ready ? formatINR(quote.total) : '—'}
          </p>
        </div>
        <p className="pb-1.5 text-right text-xs text-slate-500">
          {quote.ready ? `${quote.distanceKm} km · incl. fees` : 'Choose a destination'}
        </p>
      </div>

      <button
        type="submit"
        disabled={!quote.ready}
        className="group mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 py-4 text-sm font-black text-white shadow-lg shadow-brand-500/25 transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
      >
        Find my {quote.skill.label} driver
        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 group-disabled:translate-x-0" aria-hidden="true" />
      </button>

      <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-500">
        <ShieldCheck className="h-3.5 w-3.5 text-brand-500" aria-hidden="true" />
        Nearest certified driver · {quote.skill.eta}
      </p>
    </form>
  )
}

export default function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-white pt-20">
      {/* Soft red wash keeps the page white while still anchoring the brand. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 45% at 82% 8%, rgba(224,30,38,0.07) 0%, rgba(255,255,255,0) 70%), radial-gradient(40% 40% at 4% 92%, rgba(224,30,38,0.05) 0%, rgba(255,255,255,0) 70%)',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto grid max-w-7xl items-start gap-12 px-4 pb-20 pt-12 sm:px-6 lg:grid-cols-[1fr_28rem] lg:gap-16 lg:px-8 lg:pb-28 lg:pt-20">
        <div className="min-w-0 max-w-2xl lg:pt-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-xs font-bold text-brand-700">
            <span className="relative flex h-2 w-2 text-brand-500">
              <span className="pulse-ring absolute inline-flex h-2 w-2 rounded-full" />
              <span className="h-2 w-2 rounded-full bg-brand-500" />
            </span>
            Now live in Hyderabad
          </span>

          <h1 className="mt-7 text-4xl font-black leading-[1.08] tracking-tight text-slate-900 sm:text-5xl lg:text-[3.5rem]">
            Get a certified driver
            <span className="mt-1 block">
              for your <KineticWord />
            </span>
          </h1>

          <p className="mt-6 text-lg leading-relaxed text-slate-600">
            Professional drivers, whenever you need them — paired with speed ceilings, guardian tracking and an
            immutable Trip Vault, so every ride is safe, accountable and provable.
          </p>

          <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-3">
            {TRUST_MARKS.map((mark) => (
              <li key={mark} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <ShieldCheck className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
                {mark}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex -space-x-2">
              {['RK', 'IS', 'VR', 'AT'].map((initials) => (
                <span
                  key={initials}
                  className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-brand-50 text-[10px] font-black text-brand-600"
                >
                  {initials}
                </span>
              ))}
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1 text-sm font-bold text-slate-900">
                <Star className="h-3.5 w-3.5 fill-brand-500 text-brand-500" aria-hidden="true" />
                4.9 average across 3.2L+ trips
              </p>
              <p className="text-xs text-slate-500">Every driver re-certified every 6 months</p>
            </div>
          </div>

          <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-slate-200 pt-8 sm:grid-cols-4">
            {STATS.map((stat) => (
              <div key={stat.label} className="flex flex-col-reverse">
                <dt className="mt-1 block text-xs leading-snug text-slate-500">{stat.label}</dt>
                <dd className="text-2xl font-black tracking-tight text-slate-900">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="min-w-0 lg:sticky lg:top-24">
          <HeroBooking />
        </div>
      </div>
    </section>
  )
}
