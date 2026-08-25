import { useState } from 'react'
import { BatteryFull, IndianRupee, Signal, TrendingUp, Wifi, XCircle, Zap } from 'lucide-react'
import { DRIVER_PROFILE, DRIVER_REQUESTS } from '../../data/mock.js'
import { cn, formatINR } from '../../lib/utils.js'
import { useToast } from '../../components/Toast.jsx'

function ScoreRing({ score }) {
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - score / 100)

  return (
    <div className="relative h-24 w-24" role="img" aria-label={`Safety score ${score} out of 100`}>
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="#F0F0F3" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="#E01E26"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-black text-slate-900">{score}</span>
        <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Score</span>
      </span>
    </div>
  )
}

export default function DriverHomeScreen({ onRequestAccepted }) {
  const { toast } = useToast()
  const [requestIndex, setRequestIndex] = useState(0)
  const request = DRIVER_REQUESTS[requestIndex]

  const decline = () => {
    setRequestIndex((i) => (i + 1) % DRIVER_REQUESTS.length)
    toast('Request declined - finding next ride', 'info')
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pt-3 text-[11px] font-semibold text-slate-500">
        <span>9:41</span>
        <span className="flex items-center gap-1.5">
          <Signal className="h-3.5 w-3.5" aria-hidden="true" />
          <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
          <BatteryFull className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>

      <header className="flex items-center justify-between px-5 pb-3 pt-2">
        <div>
          <p className="text-xs text-slate-500">Driver mode · online</p>
          <p className="text-sm font-bold text-slate-900">{DRIVER_PROFILE.name}</p>
        </div>
        <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-[10px] font-black text-brand-600">
          {DRIVER_PROFILE.badge}
        </span>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-6 no-scrollbar">
        <section className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4">
          <ScoreRing score={DRIVER_PROFILE.score} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2">
              <IndianRupee className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900">{formatINR(DRIVER_PROFILE.todayEarnings)}</p>
                <p className="text-[10px] text-slate-500">Today&apos;s earnings</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white px-3 py-2">
                <p className="text-sm font-black text-slate-900">{DRIVER_PROFILE.todayTrips}</p>
                <p className="text-[10px] text-slate-500">Trips</p>
              </div>
              <div className="rounded-xl bg-white px-3 py-2">
                <p className={cn('text-sm font-black', DRIVER_PROFILE.harshEvents > 0 ? 'text-brand-700' : 'text-brand-600')}>
                  {DRIVER_PROFILE.harshEvents}
                </p>
                <p className="text-[10px] text-slate-500">Harsh events</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Telemetry status">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
              <Zap className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-slate-900">Telematics live</p>
                <p className="text-[10px] text-slate-500">50 Hz sampling</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
              <TrendingUp className="h-4 w-4 shrink-0 text-slate-800" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-slate-900">+0.4 this week</p>
                <p className="text-[10px] text-slate-500">Score trend</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Incoming ride request">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Incoming request</h2>
          <div className="rise-in rounded-2xl border border-brand-300 bg-white p-4" key={request.id}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-black text-slate-900">{request.customer}</p>
              <span className="flex items-center gap-1 text-xs font-bold text-brand-700">
                ★ {request.rating}
              </span>
            </div>
            <div className="mt-3 space-y-2 text-xs">
              <p className="flex items-start gap-2 text-slate-700">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-slate-800" aria-hidden="true" />
                <span className="min-w-0">{request.pickup}</span>
              </p>
              <p className="flex items-start gap-2 text-slate-700">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                <span className="min-w-0">{request.drop}</span>
              </p>
            </div>
            <div className="mt-3 flex items-center gap-2 border-t border-slate-200 pt-3 text-[11px] font-semibold text-slate-500">
              <span className="rounded bg-slate-100 px-1.5 py-0.5">{request.skill}</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5">{request.distanceKm} km</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5">Ceiling {request.ceiling}</span>
              <span className="ml-auto text-base font-black text-brand-600">{formatINR(request.fare)}</span>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={decline}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-100 py-3 text-xs font-black text-slate-700 transition-colors hover:bg-slate-200"
              >
                <XCircle className="h-4 w-4" aria-hidden="true" />
                Decline
              </button>
              <button
                type="button"
                onClick={() => onRequestAccepted(request)}
                className="flex-1 rounded-xl bg-brand-500 py-3 text-xs font-black text-white transition-colors hover:bg-brand-600"
              >
                Accept & start handshake
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
