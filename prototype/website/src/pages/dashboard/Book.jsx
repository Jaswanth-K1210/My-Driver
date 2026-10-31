import { useEffect, useState } from 'react'
import PageHeader from '../../components/app/PageHeader.jsx'
import { useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  Car,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  CreditCard,
  Gauge,
  MapPin,
  Plane,
  Search,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import {
  CarSpecPicker,
  CeilingSlider,
  RequirementSelector,
  TimePicker,
  TripDetailsForm,
  VehicleTypeSelector,
} from '../../components/app/BookingFields.jsx'
import { Toggle } from '../../components/app/Primitives.jsx'
import { useAuth } from '../../context/authStore.js'
import { useTrip } from '../../context/tripStore.js'
import { useToast } from '../../context/toastStore.js'
import { REQUIREMENTS, VEHICLE_TYPES } from '../../data/mock.js'
import { isEnabled, vehicleEnabled } from '../../lib/features.js'
import { quoteFor, serverQuote } from '../../lib/booking.js'
import { api } from '../../lib/apiClient.js'
import { cn, formatINR } from '../../lib/utils.js'

export default function Book() {
  const navigate = useNavigate()
  const { config, setConfig, skills, startMatching } = useTrip()
  const { user, refreshMe } = useAuth()
  const { toast } = useToast()
  const safety = user?.safety
  const firstTime = safety ? !safety.set : false

  // Accordion open/collapse states. Safety starts open only for a customer
  // who has never chosen their defaults.
  const [openSections, setOpenSections] = useState({
    vehicle: true,
    car: true,
    requirement: true,
    safety: false,
    fare: true,
  })
  const [saveDefaults, setSaveDefaults] = useState(false)

  // Pre-fill this ride from the saved defaults, once they are known.
  useEffect(() => {
    if (!safety) return
    if (safety.set) {
      setConfig((prev) => ({
        ...prev,
        ceiling: safety.speed_limit_kmh,
        shareWithGuardians: safety.share_with_guardians,
        preferFemaleDriver: safety.prefer_female_driver,
      }))
    } else {
      setOpenSections((prev) => ({ ...prev, safety: true }))
      setSaveDefaults(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safety?.set])

  const toggleSection = (key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const [server, setServer] = useState(null)
  const [quoteError, setQuoteError] = useState(null)
  // Pay-after-trip and the urgent fee are server settings, not constants here.
  const [tripConfig, setTripConfig] = useState(null)
  useEffect(() => {
    api.catalogue.tripConfig().then(setTripConfig).catch(() => undefined)
  }, [])
  const payAfter = tripConfig?.pay_after_trip ?? false
  const eta = tripConfig?.driver_eta_minutes ?? { normal: 30, urgent: { min: 5, max: 10 } }
  const [busy, setBusy] = useState(false)

  const platformFee = server ? server.fare.platform_fee : 19
  const baseNightFee = server ? (server.fare.night_fee > 0 ? server.fare.night_fee : 30) : 30
  const serverNightFee = server ? server.fare.night_fee : null
  const local = quoteFor(config, skills, { platformFee, nightFee: baseNightFee, serverNightFee })

  // Server quote debounce
  useEffect(() => {
    if (!local.ready) {
      setServer(null)
      setQuoteError(null)
      return undefined
    }
    let cancelled = false
    const timer = setTimeout(() => {
      serverQuote(api, config, skills)
        .then((q) => {
          if (cancelled) return
          setQuoteError(null)
          if (q) setServer(q)
        })
        .catch((err) => {
          if (cancelled) return
          setServer(null)
          setQuoteError(err)
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [config, skills, local.ready])

  // Everything on the fare card comes from the server's quote: the same rate
  // card and fees the admin sets and the final fare uses. Nothing is priced here.
  const ready = local.ready && server != null
  const fare = server?.fare

  const set = (patch) => setConfig((prev) => ({ ...prev, ...patch }))

  const submit = async (e) => {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    try {
      if (saveDefaults) {
        // A failure to save defaults must never stop the booking (CR-7).
        try {
          await api.me.update({
            safety: {
              speed_limit_kmh: config.ceiling,
              share_with_guardians: Boolean(config.shareWithGuardians),
              prefer_female_driver: Boolean(config.preferFemaleDriver),
            },
          })
          void Promise.resolve(refreshMe()).catch(() => undefined)
        } catch {
          toast('Booking anyway. Your safety defaults could not be saved this time.', 'warning')
        }
      }
      await startMatching(config)
      navigate('/app/track')
    } catch (err) {
      toast(err?.message ?? 'Could not book that trip', 'warning')
    } finally {
      setBusy(false)
    }
  }

  // Steps renumber themselves when a phase toggle hides one.
  const showVehicleStep = VEHICLE_TYPES.filter((v) => vehicleEnabled(v.id)).length > 1
  const steps = [showVehicleStep && 'vehicle', 'car', 'trip', 'safety'].filter(Boolean)
  const step = (key) => steps.indexOf(key) + 1

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
          {/* ── CARD 1: VEHICLE TYPE (only when more than cars is enabled) ── */}
          {showVehicleStep && (
          <>
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
                  <h2 className="text-base font-bold text-slate-900">{step('vehicle')}. Vehicle type</h2>
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

          </>
          )}

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
                  <h2 className="text-base font-bold text-slate-900">{step('car')}. Your car</h2>
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
                <CarSpecPicker carDetails={config.carDetails} onChange={(carDetails) => set({ carDetails })} />
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
                  <h2 className="text-base font-bold text-slate-900">{step('trip')}. Trip and route</h2>
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
                <RequirementSelector value={config.requirement} onChange={(requirement) => set({ requirement })} />

                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
                  <TripDetailsForm config={config} setConfig={setConfig} />
                </div>

                {isEnabled('scheduledPickup') ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-700">Pickup time</label>
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
                ) : (
                  <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600">
                    <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    Pickup now · your driver is dispatched as soon as you book
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── CARD: SAFETY (asked once, then the customer's defaults) ── */}
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <button
              type="button"
              onClick={() => toggleSection('safety')}
              className="flex w-full items-center justify-between text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {step('safety')}. {firstTime ? 'Set your safety preferences' : 'Safety'}
                  </h2>
                  <p className="text-xs font-medium text-slate-500">
                    {firstTime
                      ? 'Choose once. We use them for every ride, and you can change them any time.'
                      : [
                          `Speed limit ${config.ceiling} km/h`,
                          config.shareWithGuardians && 'shared with guardians',
                          config.preferFemaleDriver && 'female driver preferred',
                        ].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
              {openSections.safety ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
            </button>

            {openSections.safety && (
              <div className="mt-4 space-y-5 border-t border-slate-100 pt-4">
                <CeilingSlider value={config.ceiling} onChange={(ceiling) => set({ ceiling })} />
                <Toggle
                  checked={Boolean(config.shareWithGuardians)}
                  onChange={(shareWithGuardians) => set({ shareWithGuardians })}
                  label="Share every trip with my guardians"
                  description="When the trip starts, your guardians get a text with a live-tracking link. Add guardians in your profile."
                />
                <Toggle
                  checked={Boolean(config.preferFemaleDriver)}
                  onChange={(preferFemaleDriver) => set({ preferFemaleDriver })}
                  label="Prefer a female driver"
                  description="Female drivers nearby are offered your trip first. If none accepts, the next available driver is."
                />
                {!firstTime && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={saveDefaults}
                      onChange={(e) => setSaveDefaults(e.target.checked)}
                      className="h-4 w-4 accent-brand-500"
                    />
                    Make these my defaults for future rides
                  </label>
                )}
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
                Pay after the trip
              </span>
            </div>

            <fieldset className="mt-4">
              <legend className="text-xs font-bold uppercase tracking-wide text-slate-500">When do you need the driver?</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[
                  { urgent: false, icon: Clock, title: 'Standard', hint: `Driver assigned within ${eta.normal} min` },
                  {
                    urgent: true,
                    icon: Zap,
                    title: 'Urgent',
                    hint: `Driver in ${eta.urgent.min}–${eta.urgent.max} min${tripConfig ? ` · +${formatINR(tripConfig.fees.urgent_fee)}` : ''}`,
                  },
                ].map((o) => (
                  <button
                    key={o.title}
                    type="button"
                    aria-pressed={Boolean(config.urgent) === o.urgent}
                    onClick={() => setConfig((prev) => ({ ...prev, urgent: o.urgent }))}
                    className={cn(
                      'rounded-2xl border p-3 text-left transition-colors',
                      Boolean(config.urgent) === o.urgent ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300',
                    )}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                      <o.icon className="h-4 w-4 text-brand-600" aria-hidden="true" />
                      {o.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-medium text-slate-500">{o.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {ready ? (
              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Driver</dt>
                  <dd className="text-right font-semibold text-slate-800">
                    {server.tier_label}
                    <span className="block text-[11px] font-medium text-slate-400">matched to your car</span>
                  </dd>
                </div>
                {config.requirement !== 'full_time' && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Estimated distance</dt>
                    <dd className="font-semibold text-slate-800">~{server.distance_km} km</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-slate-500">
                    Trip fare
                    {fare.billed_hours != null && (
                      <span className="block text-[11px] font-medium text-slate-400">
                        {fare.billed_hours} h booked, charged by time
                      </span>
                    )}
                  </dt>
                  <dd className="font-semibold text-slate-800">{formatINR(fare.base - fare.stops_fee)}</dd>
                </div>
                {fare.stops_fee > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Stops</dt>
                    <dd className="font-semibold text-slate-800">{formatINR(fare.stops_fee)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-slate-500">Platform fee</dt>
                  <dd className="font-semibold text-slate-800">{formatINR(fare.platform_fee)}</dd>
                </div>
                {fare.night_fee > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Night fee (10 pm – 5 am)</dt>
                    <dd className="font-semibold text-slate-800">{formatINR(fare.night_fee)}</dd>
                  </div>
                )}
                {fare.urgent_fee > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Urgent (driver in {eta.urgent.min}–{eta.urgent.max} min)</dt>
                    <dd className="font-semibold text-slate-800">{formatINR(fare.urgent_fee)}</dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between border-t border-slate-200 pt-3.5">
                  <div>
                    <dt className="font-black text-base text-slate-900">Estimated total</dt>
                    <span className="text-[11px] text-slate-400">
                      {payAfter
                        ? 'Nothing is charged now. You pay the final fare, on the distance actually driven, after the trip ends.'
                        : 'Nothing is charged now. We place a hold for this amount and charge only the final fare, on the distance actually driven, when the trip ends.'}
                    </span>
                  </div>
                  <dd className="text-3xl font-black tracking-tight text-brand-600">{formatINR(fare.total)}</dd>
                </div>
              </dl>
            ) : quoteError ? (
              <div role="alert" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
                <p className="font-bold text-amber-900">This trip goes outside the city</p>
                <p className="mt-1 text-amber-800">{quoteError.message}</p>
                <button
                  type="button"
                  onClick={() => setConfig((prev) => ({ ...prev, requirement: 'inter_city' }))}
                  className="mt-3 rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-white hover:bg-amber-600"
                >
                  Switch to Outstation
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                {local.ready ? 'Calculating your fare…' : 'Complete your trip details to see the fare.'}
              </p>
            )}

            <button
              type="submit"
              disabled={!ready || busy}
              className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-brand-500 px-6 py-4 text-base font-black text-white shadow-xl shadow-brand-500/25 transition-all hover:bg-brand-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
            >
              <Search className="h-5 w-5" />
              {busy ? 'Booking…' : 'Book a driver'}
            </button>
          </div>
        </form>

      </div>
    </div>
  )
}

