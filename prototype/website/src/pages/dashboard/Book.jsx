import { useEffect, useState } from 'react'
import PageHeader from '../../components/app/PageHeader.jsx'
import { useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  Car,
  ChevronDown,
  ChevronUp,
  Compass,
  CreditCard,
  Gauge,
  MapPin,
  Plane,
  Search,
  ShieldCheck,
} from 'lucide-react'
import {
  CarSpecPicker,
  CeilingSlider,
  RequirementSelector,
  SmartDriverPicker,
  TimePicker,
  TripDetailsForm,
  VehicleTypeSelector,
} from '../../components/app/BookingFields.jsx'
import { useTrip } from '../../context/tripStore.js'
import { useToast } from '../../context/toastStore.js'
import { REQUIREMENTS } from '../../data/mock.js'
import { getRecommendedSkillId, quoteFor, serverQuote } from '../../lib/booking.js'
import { api } from '../../lib/apiClient.js'
import { cn, formatINR } from '../../lib/utils.js'

export default function Book() {
  const navigate = useNavigate()
  const { config, setConfig, skills, startMatching } = useTrip()
  const { toast } = useToast()

  // Accordion open/collapse states
  const [openSections, setOpenSections] = useState({
    vehicle: true,
    car: true,
    requirement: true,
    driver: true,
    safety: false,
    fare: true,
  })

  const toggleSection = (key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const local = quoteFor(config, skills)
  const [server, setServer] = useState(null)
  const [busy, setBusy] = useState(false)

  // Server quote debounce
  useEffect(() => {
    if (!local.ready) {
      setServer(null)
      return undefined
    }
    let cancelled = false
    const timer = setTimeout(() => {
      serverQuote(api, config, skills)
        .then((q) => {
          if (!cancelled && q) setServer(q)
        })
        .catch(() => {
          if (!cancelled) setServer(null)
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [config, skills, local.ready])

  const quote = local
  const total = server ? server.fare.total : local.total
  const nightFee = server ? server.fare.night_fee : local.nightFee

  const set = (patch) => setConfig((prev) => ({ ...prev, ...patch }))

  // Auto-match driver skill whenever car details or requirement changes
  const handleAutoMatch = (updatedCarOrReq) => {
    const car = updatedCarOrReq?.company ? updatedCarOrReq : config.carDetails
    const req = typeof updatedCarOrReq === 'string' ? updatedCarOrReq : config.requirement
    const recSkill = getRecommendedSkillId(car, req)
    set({ skillId: recSkill })
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!quote.ready || busy) return
    setBusy(true)
    try {
      await startMatching(config)
      navigate('/app/track')
    } catch (err) {
      toast(err?.message ?? 'Could not book that trip', 'warning')
    } finally {
      setBusy(false)
    }
  }

  const activeReq = REQUIREMENTS.find((r) => r.id === config.requirement) ?? REQUIREMENTS[0]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Book a driver"
        subtitle="Tell us about your car and your trip. We match you with a verified driver, and the trip is tracked end to end."
      />

      <div>
        <form onSubmit={submit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 space-y-4">
          {/* ── CARD 1: VEHICLE TYPE ── */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
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
                  <h2 className="text-base font-bold text-slate-900">1. Vehicle type</h2>
                  {!openSections.vehicle && (
                    <p className="text-xs font-medium text-brand-600 capitalize">Selected: {config.vehicleType}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700 capitalize">
                  {config.vehicleType}
                </span>
                {openSections.vehicle ? (
                  <ChevronUp className="h-5 w-5 text-slate-400" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-slate-400" />
                )}
              </div>
            </button>

            {openSections.vehicle && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <VehicleTypeSelector value={config.vehicleType} onChange={(vehicleType) => set({ vehicleType })} />
              </div>
            )}
          </div>

          {/* ── CARD 2: CAR SPECIFICATIONS & GARAGE ── */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <button
              type="button"
              onClick={() => toggleSection('car')}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-800">
                  <Gauge className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">2. Your car</h2>
                  {!openSections.car && (
                    <p className="text-xs font-medium text-slate-500">
                      {config.carDetails.company} {config.carDetails.model} · {config.carDetails.engineType} · {config.carDetails.transmission}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-flex rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700 border border-brand-100">
                  {config.carDetails.company} {config.carDetails.model}
                </span>
                {openSections.car ? (
                  <ChevronUp className="h-5 w-5 text-slate-400" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-slate-400" />
                )}
              </div>
            </button>

            {openSections.car && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <CarSpecPicker
                  carDetails={config.carDetails}
                  onChange={(carDetails) => set({ carDetails })}
                  onAutoMatchSkill={handleAutoMatch}
                />
              </div>
            )}
          </div>

          {/* ── CARD 3: TRIP REQUIREMENT ── */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
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
                  {config.requirement === 'full_time' && <CalendarDays className="h-5 w-5" />}
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">3. Trip and route</h2>
                  {!openSections.requirement && (
                    <p className="text-xs font-medium text-slate-500">
                      {activeReq.label} · {config.tripType === 'two_way' ? 'Round Trip' : 'One Way'}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">
                  {activeReq.label}
                </span>
                {openSections.requirement ? (
                  <ChevronUp className="h-5 w-5 text-slate-400" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-slate-400" />
                )}
              </div>
            </button>

            {openSections.requirement && (
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
                <RequirementSelector
                  value={config.requirement}
                  onChange={(requirement) => set({ requirement })}
                  onAutoMatchSkill={(req) => handleAutoMatch(req)}
                />

                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                  <TripDetailsForm config={config} setConfig={setConfig} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Pickup Schedule</label>
                    <TimePicker value={config.pickupTime} onChange={(pickupTime) => set({ pickupTime })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Date</label>
                    <div className="flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
                      {['Today', 'Tomorrow', 'Custom Date'].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => set({ pickupDate: d })}
                          className={cn(
                            'flex-1 rounded-xl py-2.5 text-xs font-bold transition-all',
                            (config.pickupDate || 'Today') === d
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900',
                          )}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── CARD 4: SMART DRIVER SELECTION ── */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <button
              type="button"
              onClick={() => toggleSection('driver')}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">4. Driver tier</h2>
                  {!openSections.driver && (
                    <p className="text-xs font-medium text-emerald-600">
                      Tier: {quote.skill.label} (₹{quote.skill.rate}/km)
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-100">
                  {quote.skill.label}
                </span>
                {openSections.driver ? (
                  <ChevronUp className="h-5 w-5 text-slate-400" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-slate-400" />
                )}
              </div>
            </button>

            {openSections.driver && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <SmartDriverPicker config={config} onChange={(skillId) => set({ skillId })} skills={skills} />
              </div>
            )}
          </div>

          {/* ── CARD 5: SAFETY CONTROLS (COLLAPSED BY DEFAULT) ── */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <button
              type="button"
              onClick={() => toggleSection('safety')}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <Gauge className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">5. Safety</h2>
                  <p className="text-xs font-medium text-slate-500">
                    Speed limit {config.ceiling} km/h · the driver is alerted above it
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {openSections.safety ? (
                  <ChevronUp className="h-5 w-5 text-slate-400" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-slate-400" />
                )}
              </div>
            </button>

            {openSections.safety && (
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-5">
                <CeilingSlider value={config.ceiling} onChange={(ceiling) => set({ ceiling })} />
              </div>
            )}
          </div>

          </div>

          {/* ── FARE: sticky beside the form on wide screens ── */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6 lg:sticky lg:top-24">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <CreditCard className="h-5 w-5 text-brand-600" />
                <h2 className="text-base font-black text-slate-900">Fare and booking</h2>
              </div>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                Refundable hold
              </span>
            </div>

            <dl className="mt-4 space-y-2.5 text-sm">
              {quote.lines.map((line) => (
                <div key={line.label} className="flex justify-between">
                  <dt className="text-slate-500">{line.label}</dt>
                  <dd className="font-semibold text-slate-800">{line.value}</dd>
                </div>
              ))}
              {nightFee > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Night monitoring allowance</dt>
                  <dd className="font-semibold text-slate-800">{formatINR(nightFee)}</dd>
                </div>
              )}
              {quote.note && (
                <div className="rounded-xl bg-slate-50 p-2.5 text-xs text-slate-500 font-medium">
                  ℹ️ {quote.note}
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-slate-200 pt-3.5">
                <div>
                  <dt className="font-black text-base text-slate-900">Estimated total</dt>
                  <span className="text-[11px] text-slate-400">Includes the platform fee. You pay the final fare when the trip ends.</span>
                </div>
                <dd className="text-3xl font-black tracking-tight text-brand-600">
                  {quote.ready ? formatINR(total) : '—'}
                </dd>
              </div>
            </dl>

            <button
              type="submit"
              disabled={!quote.ready || busy}
              className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-brand-500 px-6 py-4 text-base font-black text-white shadow-xl shadow-brand-500/25 transition-all hover:bg-brand-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
            >
              <Search className="h-5 w-5" />
              {busy ? 'Booking…' : `Book a ${quote.skill.label} driver`}
            </button>
            {!quote.ready && (
              <p className="mt-2 text-center text-xs text-slate-500">Complete your trip details to see the fare</p>
            )}
          </div>
        </form>

      </div>
    </div>
  )
}

