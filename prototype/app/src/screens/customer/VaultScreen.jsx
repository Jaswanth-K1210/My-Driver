import { BadgeCheck, Archive, Download, ShieldCheck } from 'lucide-react'
import { VISION_MODES } from '../../data/mock.js'
import { cn, formatINR } from '../../lib/utils.js'
import { useToast } from '../../components/Toast.jsx'

function TripDetail({ trip }) {
  const { toast } = useToast()
  const mode = VISION_MODES.find((m) => m.id === trip.visionMode)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-slate-900">{trip.date}</p>
          <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[10px] font-black text-brand-600">{trip.skill}</span>
        </div>
        <p className="mt-2 text-sm font-semibold text-slate-700">
          {trip.from} <span className="text-slate-400">→</span> {trip.to}
        </p>
        <p className="text-xs text-slate-500">Driver {trip.driver} · {formatINR(trip.fare)}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Max speed', value: `${trip.maxSpeed} km/h`, danger: trip.maxSpeed > trip.ceiling },
          { label: 'Ceiling', value: `${trip.ceiling} km/h`, danger: false },
          { label: 'Breaches', value: String(trip.breaches), danger: trip.breaches > 0 },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-3 text-center">
            <p className={cn('text-sm font-black', stat.danger ? 'text-brand-700' : 'text-slate-900')}>{stat.value}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <section aria-label="Inspection photos">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">8-point inspection</h3>
        <div className="grid grid-cols-4 gap-2">
          {['Front', 'Rear', 'Left', 'Right', 'Dash', 'Seats', 'Fuel', 'Boot'].map((zone) => (
            <div key={zone} className="flex flex-col items-center gap-1 rounded-lg border border-slate-200 bg-white p-2">
              <span className="flex h-9 w-full items-center justify-center rounded-md bg-slate-100">
                <ShieldCheck className="h-4 w-4 text-brand-500" aria-hidden="true" />
              </span>
              <span className="text-[9px] font-bold text-slate-500">{zone}</span>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500">
          Pre {trip.preInspection} · Post {trip.postInspection} · watermarked & immutable
        </p>
      </section>

      <section className="rounded-2xl border border-brand-200 bg-brand-50 p-4" aria-label="Trip certificate">
        <div className="flex items-start gap-3">
          <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-slate-900">Trip certificate</p>
            <p className="truncate text-xs text-slate-500">
              Cert {trip.certId} · Mode {mode ? `${mode.id} (${mode.name})` : trip.visionMode}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => toast('Certificate exported to downloads (demo)', 'success')}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 text-xs font-black text-white transition-colors hover:bg-brand-600"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Export PDF certificate
        </button>
      </section>
    </div>
  )
}

export default function VaultScreen({ trips, onOpenTrip }) {
  return (
    <div className="flex h-full flex-col">
      <header className="px-5 pb-3 pt-6">
        <h1 className="flex items-center gap-2 text-lg font-black text-slate-900">
          <Archive className="h-5 w-5 text-brand-500" aria-hidden="true" />
          Trip Vault
        </h1>
        <p className="text-xs text-slate-500">{trips.length} sealed trips · tamper-proof archive</p>
      </header>

      <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-6 no-scrollbar">
        {trips.map((trip) => {
          const breached = trip.breaches > 0
          return (
            <li key={trip.id}>
              <button
                type="button"
                onClick={() => onOpenTrip(trip)}
                className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-300"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {trip.from} → {trip.to}
                  </p>
                  <span
                    className={cn(
                      'shrink-0 rounded-md px-2 py-0.5 text-[10px] font-black',
                      breached ? 'bg-brand-50 text-brand-700' : 'bg-brand-50 text-brand-600',
                    )}
                  >
                    {breached ? `${trip.breaches} breach` : 'Clean'}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">{trip.date}</p>
                <div className="mt-2 flex items-center gap-2 text-[10px] font-semibold text-slate-500">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5">{trip.skill}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5">Mode {trip.visionMode}</span>
                  <span className="ml-auto font-black text-slate-700">{formatINR(trip.fare)}</span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export { TripDetail }
