import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Car, ChevronDown, ChevronUp, Compass, CreditCard, Gauge, MapPin, Plane, ShieldCheck, Star } from 'lucide-react'
import { HERO_WORDS, STATS, TRUST_MARKS, REQUIREMENTS } from '../../data/mock.js'
import { useTrip } from '../../context/tripStore.js'
import { DEFAULT_CONFIG, getRecommendedSkillId, quoteFor } from '../../lib/booking.js'
import { formatINR } from '../../lib/utils.js'
import {
  CarSpecPicker,
  RequirementSelector,
  TimePicker,
  TripDetailsForm,
  VehicleTypeSelector,
} from '../app/BookingFields.jsx'

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

/**
 * Full booking configurator shown in the hero. It seeds the same config shape
 * the dashboard uses, and hands it to /app/book on submit so nothing is retyped.
 */
function HeroBooking() {
  const navigate = useNavigate()
  const { setConfig: setTripConfig, skills } = useTrip()
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const quote = quoteFor(config, skills)
  const set = (patch) => setConfig((prev) => ({ ...prev, ...patch }))

  const [openSections, setOpenSections] = useState({
    vehicle: true,
    requirement: false,
  })

  const toggleSection = (key) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))

  const handleAutoMatch = (updatedCarOrReq) => {
    const car = updatedCarOrReq?.company ? updatedCarOrReq : config.carDetails
    const req = typeof updatedCarOrReq === 'string' ? updatedCarOrReq : config.requirement
    const recSkill = getRecommendedSkillId(car, req)
    set({ skillId: recSkill })
  }

  const submit = (e) => {
    e.preventDefault()
    // Hand the configuration to the shared trip store so /app/book opens
    // pre-filled — and so a signed-out visitor still has it after logging in.
    setTripConfig(config)
    navigate('/app/book')
  }

  const activeReq = REQUIREMENTS.find((r) => r.id === config.requirement) ?? REQUIREMENTS[0]

  return (
    <form onSubmit={submit} className="w-full space-y-4">
      {/* ── CARD 1: VEHICLE & CAR SPECS ── */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/10 transition-all">
        <button
          type="button"
          onClick={() => toggleSection('vehicle')}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Car className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">1. Vehicle & Car</h2>
              {!openSections.vehicle && (
                <p className="text-xs font-medium text-slate-500">
                  {config.vehicleType} · {config.carDetails.company} {config.carDetails.model}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {openSections.vehicle ? (
              <ChevronUp className="h-5 w-5 text-slate-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-slate-400" />
            )}
          </div>
        </button>

        {openSections.vehicle && (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-5">
            <VehicleTypeSelector value={config.vehicleType} onChange={(vehicleType) => set({ vehicleType })} />
            <div className="pt-2">
              <CarSpecPicker carDetails={config.carDetails} onChange={(carDetails) => set({ carDetails })} onAutoMatchSkill={handleAutoMatch} />
            </div>
          </div>
        )}
      </div>

      {/* ── CARD 2: TRIP REQUIREMENT ── */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/10 transition-all">
        <button
          type="button"
          onClick={() => toggleSection('requirement')}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              {config.requirement === 'within_city' && <MapPin className="h-5 w-5" />}
              {config.requirement === 'inter_city' && <Compass className="h-5 w-5" />}
              {config.requirement === 'airport' && <Plane className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">2. Route Details</h2>
              {!openSections.requirement && (
                <p className="text-xs font-medium text-slate-500">
                  {activeReq.label} · {config.tripType === 'two_way' ? 'Round Trip' : 'One Way'}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {openSections.requirement ? (
              <ChevronUp className="h-5 w-5 text-slate-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-slate-400" />
            )}
          </div>
        </button>

        {openSections.requirement && (
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
            <RequirementSelector value={config.requirement} onChange={(requirement) => set({ requirement })} onAutoMatchSkill={handleAutoMatch} />
            <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
              <TripDetailsForm config={config} setConfig={setConfig} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">Pickup Schedule</label>
              <TimePicker value={config.pickupTime} onChange={(pickupTime) => set({ pickupTime })} />
            </div>
          </div>
        )}
      </div>

      {/* ── CARD 3: SUMMARY & BOOK ── */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-900/10 transition-all">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <CreditCard className="h-5 w-5 text-brand-600" />
            <h2 className="text-base font-black text-slate-900">Instant Booking</h2>
          </div>
          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
            Fare Locked
          </span>
        </div>

        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Estimated fare</p>
            <p className="mt-0.5 text-3xl font-black tracking-tight text-slate-900">
              {quote.ready ? formatINR(quote.total) : '—'}
            </p>
          </div>
          <p className="pb-1 text-right text-xs text-slate-500 max-w-[120px] leading-tight">
            {quote.ready ? `${quote.distanceKm} km · incl. fees` : 'Complete all fields to book'}
          </p>
        </div>

        <button
          type="submit"
          disabled={!quote.ready}
          className="group mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 py-4 text-sm font-black text-white shadow-lg shadow-brand-500/25 transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
        >
          Find my {quote.skill.label} driver
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1 group-disabled:translate-x-0" aria-hidden="true" />
        </button>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-brand-500" aria-hidden="true" />
          Nearest certified driver · {quote.skill.eta}
        </p>
      </div>
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
