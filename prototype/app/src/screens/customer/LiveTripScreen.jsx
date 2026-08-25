import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Car,
  Gauge,
  MessageSquare,
  Phone,
  Siren,
  Star,
  Users,
  X,
} from 'lucide-react'
import MapCanvas from '../../components/MapCanvas.jsx'
import Sheet from '../../components/Sheet.jsx'
import { useToast } from '../../components/Toast.jsx'
import { DEFAULT_GUARDIANS } from '../../data/mock.js'
import { cn, formatINR, maskPhone } from '../../lib/utils.js'

const TOTAL_MINUTES = 18
const SOS_HOLD_MS = 1200
const SOS_COUNTDOWN_S = 5

function statusFor(progress) {
  if (progress < 8) return 'Driver is arriving at pickup'
  if (progress < 90) return 'On the way'
  if (progress < 100) return 'Arriving at destination'
  return 'Trip complete'
}

export default function LiveTripScreen({ trip, onComplete, onCancel }) {
  const { toast } = useToast()
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState(24)
  const [maxSpeed, setMaxSpeed] = useState(0)
  const [breaches, setBreaches] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sharedIds, setSharedIds] = useState([])
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [sosStage, setSosStage] = useState('idle')
  const [countdown, setCountdown] = useState(SOS_COUNTDOWN_S)
  const holdRef = useRef(null)
  const completedRef = useRef(false)

  useEffect(() => {
    const tick = setInterval(() => {
      setProgress((p) => Math.min(100, p + 0.4))
    }, 130)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    const tick = setInterval(() => {
      const drift = 0.45 + Math.random() * 0.65
      const clamped = Math.max(18, Math.min(trip.ceiling + 16, Math.round(trip.ceiling * drift)))
      setSpeed(clamped)
      setMaxSpeed((m) => Math.max(m, clamped))
      if (clamped > trip.ceiling) {
        setBreaches((b) => b + 1)
        toast(`Speed breach ${clamped} km/h logged - guardians alerted`, 'warning')
      }
    }, 1600)
    return () => clearInterval(tick)
  }, [trip.ceiling, toast])

  // Latest telemetry and callback are read through refs so this effect depends
  // only on `progress`. Listing them as deps re-ran the effect mid-countdown,
  // and the cleanup then cancelled the completion timeout for good.
  const statsRef = useRef({ maxSpeed: 0, breaches: 0 })
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    statsRef.current = { maxSpeed, breaches }
    onCompleteRef.current = onComplete
  })

  useEffect(() => {
    if (progress < 100 || completedRef.current) return undefined
    completedRef.current = true
    const t = setTimeout(() => onCompleteRef.current(statsRef.current), 900)
    return () => clearTimeout(t)
  }, [progress])

  useEffect(
    () => () => {
      if (holdRef.current) clearTimeout(holdRef.current)
    },
    [],
  )

  const startSosCountdown = useCallback(() => {
    setSosStage('armed')
    setCountdown(SOS_COUNTDOWN_S)
  }, [])

  useEffect(() => {
    if (sosStage !== 'armed') return
    const t = setTimeout(() => {
      if (countdown <= 1) {
        setSosStage('fired')
        toast('Silent SOS sent - Safety Desk & guardians alerted', 'danger', 4000)
      } else {
        setCountdown((c) => c - 1)
      }
    }, 1000)
    return () => clearTimeout(t)
  }, [sosStage, countdown, toast])

  const overCeiling = speed > trip.ceiling
  const etaMin = Math.max(1, Math.ceil(TOTAL_MINUTES * (1 - progress / 100)))

  const toggleShare = (id) => {
    setSharedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const sendLinks = (channel) => {
    if (sharedIds.length === 0) {
      toast('Select at least one guardian', 'warning')
      return
    }
    toast(`Live link sent to ${sharedIds.length} guardian${sharedIds.length > 1 ? 's' : ''} via ${channel}`, 'success')
    setSheetOpen(false)
  }

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 px-5 pb-2 pt-4">
        <button
          type="button"
          onClick={() => setConfirmCancel(true)}
          aria-label="Cancel trip"
          className="rounded-full bg-white p-2 text-slate-700 transition-colors hover:text-slate-900"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="text-center">
          <p className="text-xs font-bold text-slate-900">Trip {trip.id}</p>
          <p className="text-[10px] text-slate-500">{trip.skill} · VisionCam Mode {trip.visionMode}</p>
        </div>
        <span className="flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-[10px] font-black text-brand-600">
          <Gauge className="h-3 w-3" aria-hidden="true" />
          {trip.ceiling}
        </span>
      </header>

      {confirmCancel && (
        <div className="rise-in mx-4 mb-2 rounded-xl border border-brand-300 bg-brand-50 p-3">
          <p className="text-xs font-bold text-brand-800">Cancel this trip?</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmCancel(false)}
              className="flex-1 rounded-lg bg-slate-100 py-2 text-xs font-bold text-slate-900"
            >
              Keep riding
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-lg bg-brand-500 py-2 text-xs font-black text-white"
            >
              Cancel trip
            </button>
          </div>
        </div>
      )}

      <div className="relative mx-4 h-52 shrink-0 overflow-hidden rounded-2xl border border-slate-200">
        <MapCanvas progress={progress} className="h-full w-full" />
        <span
          className={cn(
            'absolute left-2.5 top-2.5 rounded-lg px-2 py-1 text-[11px] font-black backdrop-blur',
            overCeiling ? 'bg-brand-600 text-white' : 'bg-white/85 text-brand-600',
          )}
        >
          {speed} km/h / ceiling {trip.ceiling}
        </span>
        <span className="absolute right-2.5 top-2.5 rounded-lg bg-white/85 px-2 py-1 text-[11px] font-bold text-slate-700 backdrop-blur">
          ETA {etaMin} min
        </span>
        <span className="absolute bottom-2.5 left-2.5 rounded-lg bg-white/85 px-2 py-1 text-[10px] font-semibold text-slate-700 backdrop-blur">
          {statusFor(progress)} · {Math.round(progress)}%
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 no-scrollbar">
        <section className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-black text-brand-600">
              {trip.driver.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900">{trip.driver.name}</p>
              <p className="truncate text-xs text-slate-500">
                {trip.driver.vehicle} · {trip.driver.plate}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                aria-label="Call driver"
                onClick={() => toast('Calling driver over masked number…', 'info')}
                className="rounded-full bg-slate-100 p-2.5 text-slate-700 transition-colors hover:bg-slate-200"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Message driver"
                onClick={() => toast('Secure chat opened (demo)', 'info')}
                className="rounded-full bg-slate-100 p-2.5 text-slate-700 transition-colors hover:bg-slate-200"
              >
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-200 pt-3 text-center">
            <div>
              <p className="flex items-center justify-center gap-1 text-sm font-black text-slate-900">
                <Star className="h-3.5 w-3.5 fill-brand-500 text-brand-500" aria-hidden="true" />
                {trip.driver.rating}
              </p>
              <p className="text-[10px] text-slate-500">Rating</p>
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">{trip.driver.score}</p>
              <p className="text-[10px] text-slate-500">Safety score</p>
            </div>
            <div>
              <p className={cn('text-sm font-black', breaches > 0 ? 'text-brand-700' : 'text-brand-600')}>{breaches}</p>
              <p className="text-[10px] text-slate-500">Ceiling breaches</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <Gauge className="h-3 w-3" aria-hidden="true" />
              Max speed
            </p>
            <p className={cn('mt-1 text-xl font-black', maxSpeed > trip.ceiling ? 'text-brand-700' : 'text-slate-900')}>
              {maxSpeed} <span className="text-xs font-bold text-slate-500">km/h</span>
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <Car className="h-3 w-3" aria-hidden="true" />
              Fare locked
            </p>
            <p className="mt-1 text-xl font-black text-slate-900">
              {formatINR(trip.fare)} <span className="text-xs font-bold text-slate-500">INR</span>
            </p>
          </div>
        </section>

        <p className="px-1 text-center text-[11px] leading-snug text-slate-400">
          Silent SOS also triggers on triple volume-button press. Guardians see route, speed and stops live.
        </p>
      </div>

      <div className="border-t border-slate-200 bg-white/95 p-4">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-brand-300 bg-brand-50 py-3.5 text-sm font-black text-brand-600 transition-colors hover:bg-brand-100"
          >
            <Users className="h-4 w-4" aria-hidden="true" />
            Guardian link
            {sharedIds.length > 0 && (
              <span className="rounded-md bg-brand-500 px-1.5 text-[10px] font-black text-white">{sharedIds.length}</span>
            )}
          </button>
          <button
            type="button"
            onPointerDown={() => {
              holdRef.current = setTimeout(startSosCountdown, SOS_HOLD_MS)
            }}
            onPointerUp={() => {
              if (holdRef.current) clearTimeout(holdRef.current)
            }}
            onPointerLeave={() => {
              if (holdRef.current) clearTimeout(holdRef.current)
            }}
            className="flex flex-1 select-none items-center justify-center gap-2 rounded-xl bg-brand-800 py-3.5 text-sm font-black text-white transition-colors active:bg-brand-700"
          >
            <Siren className="h-4 w-4" aria-hidden="true" />
            Hold for SOS
          </button>
        </div>
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Share guardian link">
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
                    'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                    selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black',
                      selected ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700',
                    )}
                  >
                    {g.name.charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-900">{g.name}</span>
                    <span className="block text-xs text-slate-500">
                      {g.relation} · {maskPhone(g.phone)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'h-5 w-5 shrink-0 rounded-md border-2',
                      selected ? 'border-brand-400 bg-brand-500' : 'border-slate-300',
                    )}
                    aria-hidden="true"
                  />
                </button>
              </li>
            )
          })}
        </ul>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => sendLinks('SMS')}
            className="flex-1 rounded-xl bg-slate-100 py-3 text-xs font-black text-slate-900 transition-colors hover:bg-slate-200"
          >
            Send via SMS
          </button>
          <button
            type="button"
            onClick={() => sendLinks('WhatsApp')}
            className="flex-1 rounded-xl bg-brand-500 py-3 text-xs font-black text-white transition-colors hover:bg-brand-600"
          >
            Send via WhatsApp
          </button>
        </div>
      </Sheet>

      {(sosStage === 'armed' || sosStage === 'fired') && (
        <div className="absolute inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-white/95 p-6 text-center">
          {sosStage === 'armed' ? (
            <>
              <span className="relative flex h-24 w-24 text-brand-700">
                <span className="pulse-ring absolute inline-flex h-24 w-24 rounded-full" />
                <span className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-50 text-4xl font-black text-brand-700">
                  {countdown}
                </span>
              </span>
              <p className="text-base font-black text-slate-900">SOS activating…</p>
              <p className="max-w-[240px] text-xs leading-relaxed text-slate-500">
                Safety Desk will be alerted with live location and VisionCam stream. Guardians will be notified.
              </p>
              <button
                type="button"
                onClick={() => setSosStage('idle')}
                className="mt-2 rounded-full bg-slate-100 px-6 py-3 text-sm font-black text-slate-900 transition-colors hover:bg-slate-200"
              >
                Cancel - I am safe
              </button>
            </>
          ) : (
            <>
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-50">
                <Siren className="h-10 w-10 text-brand-700" aria-hidden="true" />
              </span>
              <p className="text-base font-black text-brand-700">Emergency protocol active</p>
              <ul className="w-full max-w-[260px] space-y-2 text-left">
                {['Safety Desk escalated to L3', 'Live location streaming', 'Guardians notified via SMS', 'VisionCam evidence sealing'].map(
                  (item) => (
                    <li key={item} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[11px] font-semibold text-slate-700">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-600" aria-hidden="true" />
                      {item}
                    </li>
                  ),
                )}
              </ul>
              <button
                type="button"
                onClick={() => setSosStage('idle')}
                className="mt-2 rounded-full bg-slate-100 px-6 py-3 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-200"
              >
                End drill (demo)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
