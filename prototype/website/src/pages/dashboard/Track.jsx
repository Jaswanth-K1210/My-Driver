import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BadgeCheck,
  Car,
  CarFront,
  CheckCircle2,
  Gauge,
  Copy,
  MessageSquare,
  Search,
  Siren,
  Star,
  Users,
  X,
} from 'lucide-react'
import RoadMap from '../../components/app/RoadMap.jsx'
import PhoneFrame from '../../components/app/PhoneFrame.jsx'
import MobileTrackScreen from '../../components/app/mobile/MobileTrackScreen.jsx'
import MobileDriverAcceptScreen from '../../components/app/mobile/MobileDriverAcceptScreen.jsx'
import { Modal, SectionCard, StatCard } from '../../components/app/Primitives.jsx'
import { useTrip } from '../../context/tripStore.js'
import { useToast } from '../../context/toastStore.js'
import { api } from '../../lib/apiClient.js'
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

function Matching({ label, trip }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_auto]">
      <div className="flex flex-col items-center justify-center rounded-3xl border border-slate-200 bg-white px-6 py-24 text-center h-[500px]">
        <span className="relative flex h-20 w-20 text-brand-500">
          <span className="pulse-ring absolute inline-flex h-20 w-20 rounded-full" />
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50">
            <Search className="h-8 w-8" aria-hidden="true" />
          </span>
        </span>
        <h2 className="mt-6 text-lg font-bold text-slate-900">{label ?? 'Matching a certified driver…'}</h2>
        <p className="mt-1.5 text-sm text-slate-500">Drivers have 20 seconds to accept</p>
        <ul className="mt-6 w-full max-w-xs space-y-2">
          {['Police background check', 'Face-match handshake armed', 'VisionCam standby'].map((item) => (
            <li key={item} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>
      
      {/* Driver App Preview */}
      <div className="hidden xl:block">
        <PhoneFrame label="Driver App Preview (Accepting)">
          <MobileDriverAcceptScreen trip={trip} />
        </PhoneFrame>
      </div>
    </div>
  )
}

function TripComplete({ trip, summary, onSave, onRate }) {
  const clean = summary.breaches === 0
  const [rating, setRating] = useState(0)
  const [saving, setSaving] = useState(false)
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

      <div className="mt-6">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Rate your driver</p>
        <div className="flex justify-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              onClick={() => setRating(n)}
              className="rounded-xl p-1.5 transition-colors hover:bg-slate-100"
            >
              <Star
                className={cn('h-6 w-6', n <= rating ? 'fill-brand-500 text-brand-500' : 'text-slate-300')}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-left">
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden="true" />
        <p className="text-sm text-slate-700">
          Route, telematics and the 8-point inspection photos are sealed to this trip. Your{' '}
          <span className="font-semibold">signed trip certificate</span> is in the Trip Vault.
        </p>
      </div>

      <button
        type="button"
        disabled={saving}
        onClick={async () => {
          setSaving(true)
          try {
            if (rating > 0) await onRate?.(rating)
          } catch {
            // A rating failure must not trap the user on this screen.
          }
          await onSave()
        }}
        className="mt-6 w-full rounded-2xl bg-brand-500 px-5 py-4 text-sm font-black text-white shadow-lg shadow-brand-500/25 transition-colors hover:bg-brand-600 disabled:bg-slate-200 disabled:text-slate-500"
      >
        {saving ? 'Saving…' : rating > 0 ? 'Submit rating & finish' : 'Finish'}
      </button>
    </div>
  )
}

export default function Track() {
  const {
    phase, trip, summary, driverPosition, alerts, maxSpeed, connection, cancelTrip, rateTrip, saveToVault,
  } = useTrip()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [guardianOpen, setGuardianOpen] = useState(false)
  const [guardians, setGuardians] = useState([])
  const [shared, setShared] = useState(null)
  const [sharing, setSharing] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [handshakeOtp, setHandshakeOtp] = useState(null)
  const [sosStage, setSosStage] = useState('idle')
  const [countdown, setCountdown] = useState(SOS_COUNTDOWN_S)
  const holdRef = useRef(null)

  // Fetch handshake OTP for driver when in HANDSHAKE_PENDING phase
  useEffect(() => {
    if (trip?.status === 'HANDSHAKE_PENDING' && trip?.serverId) {
      api.trips.handshakeOtp(trip.serverId)
        .then((res) => setHandshakeOtp(res.otp))
        .catch(() => setHandshakeOtp(null))
    }
  }, [trip?.status, trip?.serverId])

  // Real guardians from the account, for the share sheet.
  useEffect(() => {
    api.me.guardians
      .list()
      .then(setGuardians)
      .catch(() => setGuardians([]))
  }, [])

  useEffect(() => () => {
    if (holdRef.current) clearTimeout(holdRef.current)
  }, [])

  // Alerts come from the server's integrity engine, not from this page.
  const seenAlerts = useRef(0)
  useEffect(() => {
    const latest = alerts.at(-1)
    if (alerts.length > seenAlerts.current && latest) {
      const what = latest.reason === 'SPEED_CEILING_BREACH' ? 'Speed limit exceeded'
        : latest.reason === 'ROUTE_DEVIATION_EXCEEDED' ? 'Route deviation detected'
        : 'Driver signal lost'
      toast(`${what}. The Safety Desk has been alerted.`, 'warning', 5000)
    }
    seenAlerts.current = alerts.length
  }, [alerts, toast])

  useEffect(() => {
    if (sosStage !== 'armed') return undefined
    const t = setTimeout(() => {
      if (countdown <= 1) {
        setSosStage('sending')
        api.trips
          .sos(trip.serverId, { silent: true })
          .then(() => setSosStage('fired'))
          .catch((err) => {
            // Never pretend an SOS went through. Tell them to call 112.
            setSosStage('failed')
            toast(err?.message ?? 'SOS could not reach the Safety Desk', 'danger', 6000)
          })
      } else {
        setCountdown((c) => c - 1)
      }
    }, 1000)
    return () => clearTimeout(t)
  }, [sosStage, countdown, toast, trip?.serverId])

  if (phase === 'idle') return <EmptyState />
  if (phase === 'matching') return <Matching label={trip?.statusLabel} trip={trip} />
  if (phase === 'complete' && trip) {
    return (
      <TripComplete
        trip={trip}
        summary={summary ?? { maxSpeed, breaches: alerts.length }}
        onRate={rateTrip}
        onSave={async () => {
          await saveToVault()
          navigate('/app/vault')
        }}
      />
    )
  }
  if (!trip) return <EmptyState />

  const breaches = alerts.length
  const speed = driverPosition?.speed != null ? Math.round(driverPosition.speed) : null
  const overCeiling = speed != null && speed > trip.ceiling
  const status = trip.statusLabel

  // One link per trip; the server texts it to every saved guardian.
  const shareLink = async (bySms) => {
    setSharing(true)
    try {
      const link = await api.trips.guardianLink(trip.serverId, bySms)
      setShared(link)
      if (bySms) {
        toast(`Live link texted to ${link.sent_to_guardians} guardian${link.sent_to_guardians === 1 ? '' : 's'}`, 'success')
      } else {
        await navigator.clipboard?.writeText(link.url)
        toast('Live link copied', 'success')
      }
    } catch (err) {
      toast(err?.message ?? 'Could not create a live link', 'warning')
    } finally {
      setSharing(false)
    }
  }

  const mapPoints = [
    { id: 'pickup', ...trip.pickup, color: '#16a34a', label: `Pickup · ${trip.from}` },
    { id: 'drop', ...trip.drop, color: '#0f172a', label: `Drop · ${trip.to}` },
    driverPosition && { id: 'driver', ...driverPosition, color: '#2563eb', label: 'Your driver' },
  ].filter(Boolean)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Live tracking</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Trip {trip.id} · {trip.skill} · {connection === 'open' ? 'Live' : 'Reconnecting…'}
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
              onClick={async () => {
                setConfirmCancel(false)
                try {
                  await cancelTrip()
                  toast('Trip cancelled', 'info')
                } catch (err) {
                  toast(err?.message ?? 'Could not cancel the trip', 'warning')
                }
              }}
              className="rounded-xl bg-brand-500 px-4 py-2 text-xs font-black text-white"
            >
              Cancel trip
            </button>
          </div>
        </div>
      )}

      {trip.status === 'HANDSHAKE_PENDING' && (
        <div className="rise-in flex flex-wrap items-center justify-between gap-4 rounded-3xl border-2 border-brand-500 bg-brand-50/70 p-6 shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-ping rounded-full bg-brand-500" />
              <span className="text-xs font-black uppercase tracking-wider text-brand-600">Pickup Handshake Required</span>
            </div>
            <h3 className="mt-1 text-lg font-bold text-slate-900">Share your 4-digit OTP with your driver</h3>
            <p className="mt-0.5 text-xs text-slate-600">The driver will verify your OTP and take a quick safety selfie to start the engine.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase text-slate-500">Your OTP:</span>
            <span className="flex items-center justify-center rounded-2xl bg-brand-500 px-5 py-2.5 font-mono text-2xl font-black tracking-widest text-white shadow-md shadow-brand-500/25">
              {handshakeOtp ?? '····'}
            </span>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-5">
          <div className="relative h-96 overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <RoadMap points={mapPoints} className="h-full w-full" label="Live trip map" />
            <span
              className={cn(
                'absolute right-4 top-4 z-10 rounded-xl px-3 py-2 text-sm font-black backdrop-blur',
                overCeiling ? 'bg-brand-600 text-white' : 'bg-white/90 text-brand-600',
              )}
            >
              {speed ?? '–'} km/h · ceiling {trip.ceiling}
            </span>
            <span className="absolute bottom-4 left-4 z-10 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-slate-700 backdrop-blur">
              {status}
              {!driverPosition && ' · waiting for driver GPS'}
            </span>
          </div>

          <SectionCard>
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-base font-black text-brand-600">
                {trip.driver?.initials ?? '··'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-bold text-slate-900">
                  {trip.driver?.name ?? 'Assigning a driver…'}
                </p>
                <p className="truncate text-sm text-slate-500">
                  {trip.driver ? `${trip.driver.vehicle} · ${trip.driver.plate}` : 'Vehicle details arrive on acceptance'}
                </p>
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
            <StatCard icon={Users} label="Guardians" value={shared ? 'Watching' : `${guardians.length} saved`} />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setGuardianOpen(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-brand-200 bg-brand-50 py-4 text-sm font-black text-brand-600 transition-colors hover:bg-brand-100"
            >
              <Users className="h-4 w-4" aria-hidden="true" />
              Share guardian link
              {shared && (
                <span className="rounded-md bg-brand-500 px-1.5 text-[10px] font-black text-white">Live</span>
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
              <MobileTrackScreen
                trip={trip}
                points={mapPoints}
                live={{ speed, maxSpeed, breaches, overCeiling, status }}
                sharedCount={shared ? guardians.length : 0}
              />
            </PhoneFrame>
          </div>
        </div>
      </div>

      <Modal open={guardianOpen} onClose={() => setGuardianOpen(false)} title="Share guardian link">
        <p className="mb-4 text-sm text-slate-600">
          Guardians get a private link showing your driver's live position and speed until the trip ends.
          No app or login needed.
        </p>
        <ul className="space-y-2">
          {guardians.length === 0 && (
            <li className="rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
              No guardians yet. Add up to 3 in your <Link to="/app/profile" className="font-semibold text-brand-600">Profile</Link>.
            </li>
          )}
          {guardians.map((g) => (
            <li key={g.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-slate-600">
                {g.name.charAt(0)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-900">{g.name}</span>
                <span className="block text-xs text-slate-500">
                  {g.relation} · {maskPhone(g.phone)}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {shared && (
          <p className="mt-4 break-all rounded-2xl bg-slate-50 p-3 font-mono text-xs text-slate-600">{shared.url}</p>
        )}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            disabled={sharing}
            onClick={() => shareLink(false)}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-100 py-3.5 text-sm font-black text-slate-900 transition-colors hover:bg-slate-200 disabled:opacity-50"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy link
          </button>
          <button
            type="button"
            disabled={sharing || guardians.length === 0}
            onClick={() => shareLink(true)}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3.5 text-sm font-black text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
            Text all guardians
          </button>
        </div>
      </Modal>

      {sosStage !== 'idle' && (
        <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-5 bg-white/97 p-6 text-center backdrop-blur">
          {sosStage === 'sending' ? (
            <p className="text-xl font-black text-slate-900">Alerting the Safety Desk…</p>
          ) : sosStage === 'failed' ? (
            <>
              <Siren className="h-12 w-12 text-brand-700" aria-hidden="true" />
              <p className="text-xl font-black text-brand-700">SOS did not go through</p>
              <p className="max-w-sm text-sm text-slate-600">Call emergency services on 112 now.</p>
              <a href="tel:112" className="rounded-full bg-brand-700 px-8 py-3.5 text-sm font-black text-white">Call 112</a>
              <button type="button" onClick={() => setSosStage('armed')} className="text-sm font-bold text-slate-600">
                Retry SOS
              </button>
            </>
          ) : sosStage === 'armed' ? (
            <>
              <span className="relative flex h-28 w-28 text-brand-700">
                <span className="pulse-ring absolute inline-flex h-28 w-28 rounded-full" />
                <span className="flex h-28 w-28 items-center justify-center rounded-full bg-brand-50 text-5xl font-black text-brand-700">
                  {countdown}
                </span>
              </span>
              <p className="text-xl font-black text-slate-900">SOS activating…</p>
              <p className="max-w-sm text-sm leading-relaxed text-slate-600">
                The Safety Desk will be alerted at emergency level with your live location, and your guardians notified.
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
                {['Safety Desk alerted at L4 (emergency)', 'Live location shared with the desk', 'Guardians notified', 'Trip evidence preserved'].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setSosStage('idle')} className="mt-2 rounded-full bg-slate-100 px-8 py-3.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200">
                Close. The Safety Desk will call you
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
