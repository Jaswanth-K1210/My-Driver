import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BadgeCheck,
  Car,
  CarFront,
  CheckCircle2,
  Gauge,
  MessageSquare,
  Phone,
  Search,
  Siren,
  Star,
  Users,
  X,
} from 'lucide-react'
import MapCanvas from '../../components/app/MapCanvas.jsx'
import PhoneFrame from '../../components/app/PhoneFrame.jsx'
import MobileTrackScreen from '../../components/app/mobile/MobileTrackScreen.jsx'
import { Modal, SectionCard, StatCard } from '../../components/app/Primitives.jsx'
import { useTrip } from '../../context/tripStore.js'
import { useToast } from '../../context/toastStore.js'
import { DEFAULT_GUARDIANS } from '../../data/mock.js'
import { useTripTelemetry } from '../../lib/useTripTelemetry.js'
import { cn, formatINR, maskPhone } from '../../lib/utils.js'

const SOS_HOLD_MS = 1200
const SOS_COUNTDOWN_S = 5

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-24 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <CarFront className="h-7 w-7" aria-hidden="true" />
      </span>
      <h2 className="mt-5 text-lg font-bold text-slate-900">No trip in progress</h2>
      <p className="mt-1.5 max-w-sm text-sm text-slate-600">
        Book a driver and this screen becomes your live map, telemetry feed and safety console.
      </p>
      <Link
        to="/app/book"
        className="mt-6 rounded-full bg-brand-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-500/25 transition-colors hover:bg-brand-600"
      >
        Book a ride
      </Link>
    </div>
  )
}

function Matching() {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white px-6 py-24 text-center">
      <span className="relative flex h-20 w-20 text-brand-500">
        <span className="pulse-ring absolute inline-flex h-20 w-20 rounded-full" />
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50">
          <Search className="h-8 w-8" aria-hidden="true" />
        </span>
      </span>
      <h2 className="mt-6 text-lg font-bold text-slate-900">Matching a certified driver…</h2>
      <p className="mt-1.5 text-sm text-slate-500">Usually under 20 seconds</p>
      <ul className="mt-6 w-full max-w-xs space-y-2">
        {['Police background check', 'Face-match handshake armed', 'VisionCam standby'].map((item) => (
          <li key={item} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function TripComplete({ trip, summary, onSave }) {
  const clean = summary.breaches === 0
  return (
    <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center">
      <span className={cn('mx-auto flex h-16 w-16 items-center justify-center rounded-3xl', clean ? 'bg-brand-50' : 'bg-brand-100')}>
        <CheckCircle2 className={cn('h-8 w-8', clean ? 'text-brand-500' : 'text-brand-700')} aria-hidden="true" />
      </span>
      <h2 className="mt-6 text-2xl font-black tracking-tight text-slate-900">Trip complete</h2>
      <p className="mt-1.5 text-sm text-slate-600">
        {trip.from} → {trip.to}
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          { label: 'Fare', value: formatINR(trip.fare) },
          { label: 'Max speed', value: `${summary.maxSpeed} km/h`, danger: summary.maxSpeed > trip.ceiling },
          { label: 'Breaches', value: String(summary.breaches), danger: summary.breaches > 0 },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className={cn('text-lg font-black', stat.danger ? 'text-brand-600' : 'text-slate-900')}>{stat.value}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-left">
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden="true" />
        <p className="text-sm text-slate-700">
          Route, telematics and inspection photos have been sealed. A trip certificate is ready in your Vault.
        </p>
      </div>

      <button
        type="button"
        onClick={onSave}
        className="mt-6 w-full rounded-2xl bg-brand-500 px-5 py-4 text-sm font-black text-white shadow-lg shadow-brand-500/25 transition-colors hover:bg-brand-600"
      >
        Seal to Trip Vault
      </button>
    </div>
  )
}

export default function Track() {
  const { phase, trip, config, summary, confirmMatch, completeTrip, cancelTrip, saveToVault } = useTrip()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [guardianOpen, setGuardianOpen] = useState(false)
  const [sharedIds, setSharedIds] = useState([])
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [sosStage, setSosStage] = useState('idle')
  const [countdown, setCountdown] = useState(SOS_COUNTDOWN_S)
  const holdRef = useRef(null)

  // Matching resolves into a live trip after a short delay.
  useEffect(() => {
    if (phase !== 'matching') return undefined
    const t = setTimeout(() => confirmMatch(config), 1800)
    return () => clearTimeout(t)
  }, [phase, config, confirmMatch])

  useEffect(() => () => {
    if (holdRef.current) clearTimeout(holdRef.current)
  }, [])

  const handleBreach = useCallback(
    (value) => toast(`Speed breach ${value} km/h logged — guardians alerted`, 'warning'),
    [toast],
  )

  const telemetry = useTripTelemetry({
    ceiling: trip?.ceiling ?? 60,
    active: phase === 'live' && Boolean(trip),
    onBreach: handleBreach,
    onComplete: completeTrip,
  })

  useEffect(() => {
    if (sosStage !== 'armed') return undefined
    const t = setTimeout(() => {
      if (countdown <= 1) {
        setSosStage('fired')
        toast('Silent SOS sent — Safety Desk & guardians alerted', 'danger', 4000)
      } else {
        setCountdown((c) => c - 1)
      }
    }, 1000)
    return () => clearTimeout(t)
  }, [sosStage, countdown, toast])

  if (phase === 'idle') return <EmptyState />
  if (phase === 'matching') return <Matching />
  if (phase === 'complete' && trip && summary) {
    return <TripComplete trip={trip} summary={summary} onSave={() => { saveToVault(); navigate('/app/vault') }} />
  }
  if (!trip) return <EmptyState />

  const { progress, speed, maxSpeed, breaches, overCeiling, etaMin, status } = telemetry

  const toggleShare = (id) =>
    setSharedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const sendLinks = (channel) => {
    if (sharedIds.length === 0) {
      toast('Select at least one guardian', 'warning')
      return
    }
    toast(`Live link sent to ${sharedIds.length} guardian${sharedIds.length > 1 ? 's' : ''} via ${channel}`, 'success')
    setGuardianOpen(false)
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Live tracking</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Trip {trip.id} · {trip.skill} · VisionCam Mode {trip.visionMode}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmCancel(true)}
          className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-brand-300 hover:text-brand-700"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Cancel trip
        </button>
      </header>

      {confirmCancel && (
        <div className="rise-in flex flex-wrap items-center gap-4 rounded-2xl border border-brand-200 bg-brand-50 p-4">
          <p className="flex-1 text-sm font-bold text-brand-900">Cancel this trip?</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmCancel(false)} className="rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-900">
              Keep riding
            </button>
            <button
              type="button"
              onClick={() => { cancelTrip(); telemetry.reset(); setConfirmCancel(false); toast('Trip cancelled', 'info') }}
              className="rounded-xl bg-brand-500 px-4 py-2 text-xs font-black text-white"
            >
              Cancel trip
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-5">
          <div className="relative h-80 overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <MapCanvas progress={progress} className="h-full w-full" />
            <span
              className={cn(
                'absolute left-4 top-4 rounded-xl px-3 py-2 text-sm font-black backdrop-blur',
                overCeiling ? 'bg-brand-600 text-white' : 'bg-white/90 text-brand-600',
              )}
            >
              {speed} km/h · ceiling {trip.ceiling}
            </span>
            <span className="absolute bottom-4 left-4 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-700 backdrop-blur">
              {status} · {Math.round(progress)}%
            </span>
            <span className="absolute bottom-4 right-4 rounded-xl bg-white/90 px-3 py-2 text-sm font-bold text-slate-700 backdrop-blur">
              ETA {etaMin} min
            </span>
          </div>

          <SectionCard>
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-base font-black text-brand-600">
                {trip.driver.initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold text-slate-900">{trip.driver.name}</p>
                <p className="truncate text-sm text-slate-500">
                  {trip.driver.vehicle} · {trip.driver.plate}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  aria-label="Call driver"
                  onClick={() => toast('Calling driver over masked number…', 'info')}
                  className="rounded-2xl bg-slate-100 p-3 text-slate-700 transition-colors hover:bg-slate-200"
                >
                  <Phone className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Message driver"
                  onClick={() => toast('Secure chat opened (demo)', 'info')}
                  className="rounded-2xl bg-slate-100 p-3 text-slate-700 transition-colors hover:bg-slate-200"
                >
                  <MessageSquare className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-200 pt-5 text-center">
              <div>
                <p className="flex items-center justify-center gap-1 text-lg font-black text-slate-900">
                  <Star className="h-4 w-4 fill-brand-500 text-brand-500" aria-hidden="true" />
                  {trip.driver.rating}
                </p>
                <p className="text-xs text-slate-500">Rating</p>
              </div>
              <div>
                <p className="text-lg font-black text-slate-900">{trip.driver.score}</p>
                <p className="text-xs text-slate-500">Safety score</p>
              </div>
              <div>
                <p className={cn('text-lg font-black', breaches > 0 ? 'text-brand-600' : 'text-slate-900')}>{breaches}</p>
                <p className="text-xs text-slate-500">Ceiling breaches</p>
              </div>
            </div>
          </SectionCard>

          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard icon={Gauge} label="Max speed" value={maxSpeed} unit="km/h" danger={maxSpeed > trip.ceiling} />
            <StatCard icon={Car} label="Fare locked" value={formatINR(trip.fare)} />
            <StatCard icon={Users} label="Guardians" value={`${sharedIds.length}/${DEFAULT_GUARDIANS.length}`} />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setGuardianOpen(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-brand-200 bg-brand-50 py-4 text-sm font-black text-brand-600 transition-colors hover:bg-brand-100"
            >
              <Users className="h-4 w-4" aria-hidden="true" />
              Share guardian link
              {sharedIds.length > 0 && (
                <span className="rounded-md bg-brand-500 px-1.5 text-[10px] font-black text-white">{sharedIds.length}</span>
              )}
            </button>
            <button
              type="button"
              onPointerDown={() => { holdRef.current = setTimeout(() => { setSosStage('armed'); setCountdown(SOS_COUNTDOWN_S) }, SOS_HOLD_MS) }}
              onPointerUp={() => { if (holdRef.current) clearTimeout(holdRef.current) }}
              onPointerLeave={() => { if (holdRef.current) clearTimeout(holdRef.current) }}
              className="flex flex-1 select-none items-center justify-center gap-2 rounded-2xl bg-brand-800 py-4 text-sm font-black text-white transition-colors hover:bg-brand-700"
            >
              <Siren className="h-4 w-4" aria-hidden="true" />
              Hold for Silent SOS
            </button>
          </div>
          <p className="text-center text-xs text-slate-500">
            Press and hold for 1.2s to arm. Guardians see route, speed and stops live.
          </p>
        </div>

        {/* The same live trip, rendered as it appears in the mobile app. */}
        <div className="hidden xl:block">
          <div className="sticky top-10">
            <PhoneFrame label="Same trip in the MyDriver app">
              <MobileTrackScreen trip={trip} telemetry={telemetry} sharedCount={sharedIds.length} />
            </PhoneFrame>
          </div>
        </div>
      </div>

      <Modal open={guardianOpen} onClose={() => setGuardianOpen(false)} title="Share guardian link">
        <ul className="space-y-2">
          {DEFAULT_GUARDIANS.map((g) => {
            const selected = sharedIds.includes(g.id)
            return (
              <li key={g.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  onClick={() => toggleShare(g.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors',
                    selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300',
                  )}
                >
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-black', selected ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600')}>
                    {g.name.charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900">{g.name}</span>
                    <span className="block text-xs text-slate-500">
                      {g.relation} · {maskPhone(g.phone)}
                    </span>
                  </span>
                  <span className={cn('h-5 w-5 shrink-0 rounded-md border-2', selected ? 'border-brand-500 bg-brand-500' : 'border-slate-300')} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={() => sendLinks('SMS')} className="flex-1 rounded-2xl bg-slate-100 py-3.5 text-sm font-black text-slate-900 transition-colors hover:bg-slate-200">
            Send via SMS
          </button>
          <button type="button" onClick={() => sendLinks('WhatsApp')} className="flex-1 rounded-2xl bg-brand-500 py-3.5 text-sm font-black text-white transition-colors hover:bg-brand-600">
            Send via WhatsApp
          </button>
        </div>
      </Modal>

      {(sosStage === 'armed' || sosStage === 'fired') && (
        <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-5 bg-white/97 p-6 text-center backdrop-blur">
          {sosStage === 'armed' ? (
            <>
              <span className="relative flex h-28 w-28 text-brand-700">
                <span className="pulse-ring absolute inline-flex h-28 w-28 rounded-full" />
                <span className="flex h-28 w-28 items-center justify-center rounded-full bg-brand-50 text-5xl font-black text-brand-700">
                  {countdown}
                </span>
              </span>
              <p className="text-xl font-black text-slate-900">SOS activating…</p>
              <p className="max-w-sm text-sm leading-relaxed text-slate-600">
                Safety Desk will be alerted with live location and VisionCam stream. Guardians will be notified.
              </p>
              <button type="button" onClick={() => setSosStage('idle')} className="mt-2 rounded-full bg-slate-100 px-8 py-3.5 text-sm font-black text-slate-900 transition-colors hover:bg-slate-200">
                Cancel — I am safe
              </button>
            </>
          ) : (
            <>
              <span className="flex h-28 w-28 items-center justify-center rounded-full bg-brand-50">
                <Siren className="h-12 w-12 text-brand-700" aria-hidden="true" />
              </span>
              <p className="text-xl font-black text-brand-700">Emergency protocol active</p>
              <ul className="w-full max-w-sm space-y-2 text-left">
                {['Safety Desk escalated to L3', 'Live location streaming', 'Guardians notified via SMS', 'VisionCam evidence sealing'].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setSosStage('idle')} className="mt-2 rounded-full bg-slate-100 px-8 py-3.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200">
                End drill (demo)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
