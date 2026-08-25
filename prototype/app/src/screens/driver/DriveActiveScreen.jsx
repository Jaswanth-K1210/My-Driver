import { useEffect, useRef, useState } from 'react'
import { Activity, Flag, Gauge, Square } from 'lucide-react'
import { cn } from '../../lib/utils.js'
import { useToast } from '../../components/Toast.jsx'

const BRAKE_THRESHOLD = 0.4
const SWERVE_THRESHOLD = 0.35

function GForceBar({ label, value, threshold, max }) {
  const pct = Math.min(100, (value / max) * 100)
  const breach = value >= threshold
  const thresholdPct = (threshold / max) * 100

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={cn('text-sm font-black', breach ? 'text-brand-700' : 'text-slate-900')}>{value.toFixed(2)}g</p>
      </div>
      <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn('h-full rounded-full transition-all duration-300', breach ? 'bg-brand-700' : 'bg-brand-500')}
          style={{ width: `${pct}%` }}
        />
        <span
          className="absolute top-0 h-full w-0.5 bg-slate-400"
          style={{ left: `${thresholdPct}%` }}
          aria-hidden="true"
        />
      </div>
      <p className="mt-1.5 text-[10px] text-slate-500">Threshold {threshold}g</p>
    </div>
  )
}

export default function DriveActiveScreen({ request, onComplete }) {
  const { toast } = useToast()
  const [speed, setSpeed] = useState(0)
  const [brakeG, setBrakeG] = useState(0.05)
  const [swerveG, setSwerveG] = useState(0.04)
  const [events, setEvents] = useState([])
  const [elapsed, setElapsed] = useState(0)
  const lastEventRef = useRef(0)

  useEffect(() => {
    const tick = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    const tick = setInterval(() => {
      const nextSpeed = Math.max(12, Math.min(request.ceiling + 8, Math.round(request.ceiling * (0.5 + Math.random() * 0.6))))
      const nextBrake = Math.max(0.02, Math.min(0.6, brakeG + (Math.random() - 0.48) * 0.18))
      const nextSwerve = Math.max(0.02, Math.min(0.55, swerveG + (Math.random() - 0.52) * 0.16))
      setSpeed(nextSpeed)
      setBrakeG(nextBrake)
      setSwerveG(nextSwerve)

      const now = Date.now()
      if (now - lastEventRef.current > 4000) {
        if (nextBrake >= BRAKE_THRESHOLD) {
          lastEventRef.current = now
          setEvents((prev) => [{ id: now, text: `Harsh braking ${nextBrake.toFixed(2)}g`, kind: 'danger' }, ...prev].slice(0, 4))
          toast(`Harsh braking detected (${nextBrake.toFixed(2)}g) - logged`, 'warning')
        } else if (nextSwerve >= SWERVE_THRESHOLD) {
          lastEventRef.current = now
          setEvents((prev) => [{ id: now, text: `Aggressive swerve ${nextSwerve.toFixed(2)}g`, kind: 'warning' }, ...prev].slice(0, 4))
          toast(`Aggressive swerve detected (${nextSwerve.toFixed(2)}g) - logged`, 'warning')
        }
      }
    }, 1200)
    return () => clearInterval(tick)
  }, [request.ceiling, brakeG, swerveG, toast])

  const minutes = Math.floor(elapsed / 60)
  const seconds = elapsed % 60

  return (
    <div className="flex h-full flex-col">
      <header className="px-5 pb-2 pt-6 text-center">
        <p className="text-xs font-semibold text-slate-500">
          Trip in progress · {request.customer} · ceiling {request.ceiling} km/h
        </p>
        <p className="mt-1 font-mono text-3xl font-black tabular-nums text-slate-900" aria-label={`Elapsed time ${minutes} minutes ${seconds} seconds`}>
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </p>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 no-scrollbar">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-center" aria-label="Current speed">
          <p className="flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            <Gauge className="h-3 w-3" aria-hidden="true" />
            Current speed
          </p>
          <p className={cn('mt-1 text-5xl font-black tabular-nums', speed > request.ceiling ? 'text-brand-700' : 'text-slate-900')}>
            {speed}
          </p>
          <p className="text-xs font-bold text-slate-500">km/h · limit {request.ceiling}</p>
        </section>

        <section className="grid grid-cols-2 gap-3" aria-label="Telematics g-force">
          <GForceBar label="Braking" value={brakeG} threshold={BRAKE_THRESHOLD} max={0.6} />
          <GForceBar label="Swerving" value={swerveG} threshold={SWERVE_THRESHOLD} max={0.55} />
        </section>

        <section aria-label="Event log">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            Event log
          </h2>
          {events.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-[11px] text-slate-500">
              Smooth driving so far - no harsh events
            </p>
          ) : (
            <ul className="space-y-1.5">
              {events.map((event) => (
                <li
                  key={event.id}
                  className={cn(
                    'rise-in flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold',
                    event.kind === 'danger' ? 'bg-brand-50 text-brand-800' : 'bg-brand-50 text-brand-800',
                  )}
                >
                  <Flag className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {event.text}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="border-t border-slate-200 bg-white/95 p-4">
        <button
          type="button"
          onClick={() =>
            onComplete({
              durationSec: elapsed,
              events: events.length,
              maxSpeed: speed,
            })
          }
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 py-3.5 text-sm font-black text-slate-900 transition-colors hover:bg-slate-200"
        >
          <Square className="h-4 w-4 fill-brand-700 text-brand-700" aria-hidden="true" />
          End trip & settle fare
        </button>
      </div>
    </div>
  )
}
