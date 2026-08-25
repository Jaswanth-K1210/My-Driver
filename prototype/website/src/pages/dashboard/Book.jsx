import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock3, MapPin, Search, ShieldCheck } from 'lucide-react'
import {
  CeilingSlider,
  DropPicker,
  PackagePicker,
  PickupField,
  SkillPicker,
  TimePicker,
  VisionPicker,
} from '../../components/app/BookingFields.jsx'
import { SectionCard, Segmented } from '../../components/app/Primitives.jsx'
import PhoneFrame from '../../components/app/PhoneFrame.jsx'
import MobileBookScreen from '../../components/app/mobile/MobileBookScreen.jsx'
import { useTrip } from '../../context/tripStore.js'
import { useToast } from '../../context/toastStore.js'
import { PLATFORM_FEE, VISION_MODES } from '../../data/mock.js'
import { quoteFor, serverQuote } from '../../lib/booking.js'
import { api } from '../../lib/apiClient.js'
import DemoBadge from '../../components/app/DemoBadge.jsx'
import { formatINR } from '../../lib/utils.js'

const MODES = [
  { id: 'location', label: 'By location', icon: MapPin },
  { id: 'hour', label: 'By hour', icon: Clock3 },
]

export default function Book() {
  const navigate = useNavigate()
  // Config already carries anything the landing hero configured.
  const { config, setConfig, skills, startMatching } = useTrip()
  const { toast } = useToast()

  const local = quoteFor(config, skills)
  const [server, setServer] = useState(null)
  const [busy, setBusy] = useState(false)

  // The server owns pricing. The local estimate is shown until it answers so
  // the panel is never blank, then replaced by the authoritative figure.
  useEffect(() => {
    if (!local.ready) {
      setServer(null)
      return undefined
    }
    let cancelled = false
    const timer = setTimeout(() => {
      serverQuote(api, config, skills)
        .then((q) => {
          if (!cancelled) setServer(q)
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
  const distanceKm = server ? server.distance_km : local.distanceKm
  const nightFee = server ? server.fare.night_fee : local.nightFee

  const set = (patch) => setConfig((prev) => ({ ...prev, ...patch }))

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

  const visionMode = VISION_MODES.find((m) => m.id === config.visionMode)

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Book a ride</h1>
        <p className="mt-1.5 text-sm text-slate-600">
          Configure the trip exactly as you would in the app — the fare is locked before you confirm.
        </p>
      </header>

      <div className="grid gap-8 xl:grid-cols-[1fr_auto]">
        <form onSubmit={submit} className="min-w-0 space-y-5">
          <SectionCard title="Trip" icon={MapPin}>
            <Segmented size="lg" options={MODES} value={config.mode} onChange={(mode) => set({ mode })} />
            <div className="mt-4 space-y-3">
              <PickupField size="lg" />
              {config.mode === 'location' ? (
                <DropPicker size="lg" value={config.dropId} onChange={(dropId) => set({ dropId })} />
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    How long do you need a driver?
                  </p>
                  <PackagePicker value={config.packageId} onChange={(packageId) => set({ packageId })} />
                </div>
              )}
              <TimePicker size="lg" value={config.pickupTime} onChange={(pickupTime) => set({ pickupTime })} />
            </div>
          </SectionCard>

          <SectionCard title="Skill certification" icon={ShieldCheck}>
            <SkillPicker value={config.skillId} onChange={(skillId) => set({ skillId })} />
            <p className="mt-3 text-sm text-slate-600">{quote.skill.description}</p>
          </SectionCard>

          <SectionCard title="Safety configuration">
            <CeilingSlider value={config.ceiling} onChange={(ceiling) => set({ ceiling })} />
            <div className="mt-6">
              <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                VisionCam mode
                <DemoBadge title="VisionCam is not part of this backend — see the app website" />
              </p>
              <VisionPicker value={config.visionMode} onChange={(mode) => set({ visionMode: mode })} />
            </div>
          </SectionCard>

          <SectionCard title="Fare estimate">
            <dl className="space-y-2.5 text-sm">
              {quote.lines.map((line) => (
                <div key={line.label} className="flex justify-between">
                  <dt className="text-slate-500">{line.label}</dt>
                  <dd className="font-semibold text-slate-700">{line.value}</dd>
                </div>
              ))}
              {quote.ready && server && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Routed distance</dt>
                  <dd className="font-semibold text-slate-700">{distanceKm.toFixed(1)} km</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-500">Platform fee</dt>
                <dd className="font-semibold text-slate-700">{formatINR(PLATFORM_FEE)}</dd>
              </div>
              {nightFee > 0 && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Night monitoring</dt>
                  <dd className="font-semibold text-slate-700">{formatINR(nightFee)}</dd>
                </div>
              )}
              <div className="flex items-baseline justify-between border-t border-slate-200 pt-3">
                <dt className="font-bold text-slate-900">
                  {server ? 'Fare' : 'Estimated fare'}
                </dt>
                <dd className="text-2xl font-black tracking-tight text-brand-600">
                  {quote.ready ? formatINR(total) : '—'}
                </dd>
              </div>
            </dl>

            <button
              type="submit"
              disabled={!quote.ready || busy}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 py-4 text-sm font-black text-white shadow-lg shadow-brand-500/25 transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              {busy ? 'Booking…' : `Find my ${quote.skill.label} driver`}
            </button>
            {!quote.ready && (
              <p className="mt-2 text-center text-xs text-slate-500">Choose a destination to continue</p>
            )}
          </SectionCard>
        </form>

        {/* Live mirror of the same configuration as it appears in the mobile app. */}
        <div className="hidden xl:block">
          <div className="sticky top-10">
            <PhoneFrame label="Same booking in the MyDriver app">
              <MobileBookScreen config={config} quote={quote} visionMode={visionMode} />
            </PhoneFrame>
          </div>
        </div>
      </div>
    </div>
  )
}
