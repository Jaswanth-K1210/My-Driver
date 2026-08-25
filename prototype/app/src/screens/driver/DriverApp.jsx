import { useState } from 'react'
import { BadgeCheck, Check, IndianRupee } from 'lucide-react'
import { DRIVER_PROFILE } from '../../data/mock.js'
import { cn, formatINR } from '../../lib/utils.js'
import DriverHomeScreen from './DriverHomeScreen.jsx'
import HandshakeScreen from './HandshakeScreen.jsx'
import InspectionScreen from './InspectionScreen.jsx'
import DriveActiveScreen from './DriveActiveScreen.jsx'

function TripSummary({ request, result, onDone }) {
  const minutes = Math.max(1, Math.round(result.durationSec / 60))
  const payout = Math.round(request.fare * 0.82)

  return (
    <div className="flex h-full flex-col">
      <header className="px-5 pb-2 pt-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
          <Check className="h-7 w-7 text-brand-500" aria-hidden="true" />
        </span>
        <h1 className="mt-3 text-lg font-black text-slate-900">Trip settled</h1>
        <p className="text-xs text-slate-500">Evidence sealed · score updated</p>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 no-scrollbar">
        <section className="rounded-2xl border border-brand-200 bg-brand-50 p-5 text-center">
          <p className="text-xs font-semibold text-slate-500">Your payout (82%)</p>
          <p className="mt-1 text-3xl font-black text-brand-600">{formatINR(payout)}</p>
          <p className="mt-1 text-[11px] text-slate-500">Fare {formatINR(request.fare)} · weekly settlement</p>
        </section>

        <section className="grid grid-cols-3 gap-2" aria-label="Trip stats">
          {[
            { label: 'Duration', value: `${minutes} min` },
            { label: 'Harsh events', value: String(result.events) },
            { label: 'Inspection', value: '8/8' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-3 text-center">
              <p className={cn('text-sm font-black', stat.label === 'Harsh events' && result.events > 0 ? 'text-brand-700' : 'text-slate-900')}>
                {stat.value}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">{stat.label}</p>
            </div>
          ))}
        </section>

        <section className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <BadgeCheck className="h-8 w-8 shrink-0 text-brand-500" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">Score impact</p>
            <p className="text-xs leading-relaxed text-slate-500">
              {result.events === 0
                ? `Clean run - score holds at ${DRIVER_PROFILE.score}.`
                : `${result.events} event${result.events > 1 ? 's' : ''} logged - minor review, no deduction.`}
            </p>
          </div>
        </section>
      </div>

      <div className="border-t border-slate-200 bg-white/95 p-4">
        <button
          type="button"
          onClick={onDone}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3.5 text-sm font-black text-white transition-colors hover:bg-brand-600"
        >
          <IndianRupee className="h-4 w-4" aria-hidden="true" />
          Back to dashboard
        </button>
      </div>
    </div>
  )
}

export default function DriverApp() {
  const [phase, setPhase] = useState('home')
  const [request, setRequest] = useState(null)
  const [result, setResult] = useState(null)

  if (phase === 'home') {
    return (
      <DriverHomeScreen
        onRequestAccepted={(req) => {
          setRequest(req)
          setPhase('handshake')
        }}
      />
    )
  }

  if (phase === 'handshake') {
    return (
      <HandshakeScreen
        request={request}
        onVerified={() => setPhase('inspection')}
        onBack={() => setPhase('home')}
      />
    )
  }

  if (phase === 'inspection') {
    return <InspectionScreen onInspectionDone={() => setPhase('active')} onBack={() => setPhase('handshake')} />
  }

  if (phase === 'active') {
    return (
      <DriveActiveScreen
        request={request}
        onComplete={(tripResult) => {
          setResult(tripResult)
          setPhase('summary')
        }}
      />
    )
  }

  return <TripSummary request={request} result={result} onDone={() => setPhase('home')} />
}
