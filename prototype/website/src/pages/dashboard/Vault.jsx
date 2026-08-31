import { useState } from 'react'
import { Archive, BadgeCheck, Download, ShieldCheck } from 'lucide-react'
import { Modal } from '../../components/app/Primitives.jsx'
import { useTrip } from '../../context/tripStore.js'
import { useToast } from '../../context/toastStore.js'
import { VISION_MODES } from '../../data/mock.js'
import { cn, formatINR } from '../../lib/utils.js'

const ZONES = ['Front', 'Rear', 'Left', 'Right', 'Dash', 'Seats', 'Fuel', 'Boot']

function TripDetail({ trip }) {
  const { toast } = useToast()
  const mode = VISION_MODES.find((m) => m.id === trip.visionMode)

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-slate-900">{trip.date}</p>
          <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-[11px] font-black text-brand-600">{trip.skill}</span>
        </div>
        <p className="mt-3 text-base font-semibold text-slate-800">
          {trip.from} <span className="text-slate-400">→</span> {trip.to}
        </p>
        <p className="mt-0.5 text-sm text-slate-500">
          Driver {trip.driverName} · {formatINR(trip.fare)}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Distance', value: `${Number(trip.distanceKm).toFixed(1)} km`, danger: false },
          { label: 'Ceiling', value: `${trip.ceiling} km/h`, danger: false },
          { label: 'Duration', value: trip.durationMin ? `${trip.durationMin} min` : '—', danger: false },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
            <p className={cn('text-base font-black', stat.danger ? 'text-brand-600' : 'text-slate-900')}>{stat.value}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <section>
        <h3 className="mb-2.5 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-500">
          <span>8-point vehicle inspection</span>
          <span className="normal-case text-brand-600">Verified</span>
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {ZONES.map((zone) => (
            <div key={zone} className="flex flex-col items-center gap-1.5 rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5">
              <span className="flex h-10 w-full items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="text-[10px] font-bold text-emerald-700">{zone}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] font-semibold text-slate-500">
          <span>Pre-trip: {trip.preInspection ?? trip.requestedAt?.split('T')[1]?.slice(0,5) ?? '09:18 PM'}</span>
          <span>Post-trip: {trip.postInspection ?? trip.completedAt?.split('T')[1]?.slice(0,5) ?? '10:31 PM'}</span>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">VisionCam Telemetry Log</h3>
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-900 shadow-inner">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <span className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md">
                <ShieldCheck className="h-6 w-6" />
              </span>
              <p className="text-xs font-bold text-white">Mode {mode ? `${mode.id} (${mode.name})` : trip.visionMode}</p>
              <p className="mt-1 text-[10px] text-slate-400">Encrypted footage sealed in vault</p>
            </div>
          </div>
          {/* Faux timestamp overlay */}
          <div className="absolute bottom-3 left-3 text-[10px] font-mono text-white/70">
            {trip.date} • {trip.id}
          </div>
          <div className="absolute bottom-3 right-3 flex items-center gap-1 text-[10px] font-bold text-red-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> REC
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-black text-slate-900">
              Trip certificate
            </p>
            <p className="truncate text-xs text-slate-600">
              Cert {trip.certId} · Legally binding export
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => toast('Certificate exported to downloads (demo)', 'success')}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3 text-sm font-black text-white transition-colors hover:bg-brand-600"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Export PDF certificate
        </button>
      </section>
    </div>
  )
}

export default function Vault() {
  const { vaultTrips } = useTrip()
  const [detail, setDetail] = useState(null)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2.5 text-3xl font-black tracking-tight text-slate-900">
          <Archive className="h-7 w-7 text-brand-500" aria-hidden="true" />
          Trip Vault
        </h1>
        <p className="mt-1.5 text-sm text-slate-600">
          {vaultTrips.length} sealed trips · tamper-proof archive
        </p>
      </header>

      {vaultTrips.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-20 text-center">
          <Archive className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="mt-4 text-base font-bold text-slate-900">No sealed trips yet</p>
          <p className="mt-1 text-sm text-slate-600">
            Complete a ride and its route, telematics and fare are archived here.
          </p>
        </div>
      )}

      <ul className="grid gap-4 sm:grid-cols-2">
        {vaultTrips.map((trip) => {
          return (
            <li key={trip.id}>
              <button
                type="button"
                onClick={() => setDetail(trip)}
                className="w-full rounded-3xl border border-slate-200 bg-white p-6 text-left transition-colors hover:border-brand-200"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate text-base font-bold text-slate-900">
                    {trip.from} → {trip.to}
                  </p>
                  <span className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                    Sealed
                  </span>
                </div>
                <p className="mt-1.5 truncate text-sm text-slate-500">{trip.date}</p>
                <div className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-slate-500">
                  <span className="rounded-md bg-slate-100 px-2 py-1">{trip.skill}</span>
                  <span className="rounded-md bg-slate-100 px-2 py-1">
                    {Number(trip.distanceKm).toFixed(1)} km
                  </span>
                  <span className="ml-auto text-sm font-black text-slate-900">{formatINR(trip.fare)}</span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="Sealed trip record">
        {detail && <TripDetail trip={detail} />}
      </Modal>
    </div>
  )
}
