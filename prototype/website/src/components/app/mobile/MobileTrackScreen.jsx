import { Gauge, MessageSquare, Phone, Siren, Star, Users, X } from 'lucide-react'
import MapCanvas from '../MapCanvas.jsx'
import { cn, formatINR } from '../../../lib/utils.js'

/**
 * The live-trip screen exactly as it appears in the MyDriver mobile app,
 * rendered from the same telemetry as the web layout beside it.
 */
export default function MobileTrackScreen({ trip, telemetry, sharedCount = 0 }) {
  const { progress, speed, maxSpeed, breaches, overCeiling, etaMin, status } = telemetry

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-2">
        <span className="rounded-full bg-slate-100 p-1.5 text-slate-600">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <div className="text-center">
          <p className="text-[11px] font-bold text-slate-900">Trip {trip.id}</p>
          <p className="text-[9px] text-slate-500">
            {trip.skill} · Mode {trip.visionMode}
          </p>
        </div>
        <span className="flex items-center gap-1 rounded-lg bg-brand-50 px-1.5 py-1 text-[9px] font-black text-brand-600">
          <Gauge className="h-2.5 w-2.5" aria-hidden="true" />
          {trip.ceiling}
        </span>
      </header>

      <div className="relative mx-3 h-44 shrink-0 overflow-hidden rounded-2xl border border-slate-200">
        <MapCanvas progress={progress} className="h-full w-full" />
        <span
          className={cn(
            'absolute left-2 top-2 rounded-lg px-1.5 py-1 text-[10px] font-black backdrop-blur',
            overCeiling ? 'bg-brand-600 text-white' : 'bg-white/90 text-brand-600',
          )}
        >
          {speed} km/h
        </span>
        <span className="absolute bottom-2 left-2 rounded-lg bg-white/90 px-1.5 py-1 text-[9px] font-semibold text-slate-700 backdrop-blur">
          {status} · {Math.round(progress)}%
        </span>
        <span className="absolute bottom-2 right-2 rounded-lg bg-white/90 px-1.5 py-1 text-[10px] font-bold text-slate-700 backdrop-blur">
          ETA {etaMin}m
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-2.5 no-scrollbar">
        <section className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-black text-brand-600">
              {trip.driver.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-slate-900">{trip.driver.name}</p>
              <p className="truncate text-[10px] text-slate-500">{trip.driver.plate}</p>
            </div>
            <span className="flex shrink-0 gap-1.5">
              <span className="rounded-full bg-slate-100 p-2 text-slate-600">
                <Phone className="h-3 w-3" aria-hidden="true" />
              </span>
              <span className="rounded-full bg-slate-100 p-2 text-slate-600">
                <MessageSquare className="h-3 w-3" aria-hidden="true" />
              </span>
            </span>
          </div>
          <div className="mt-2.5 grid grid-cols-3 gap-1.5 border-t border-slate-200 pt-2.5 text-center">
            <div>
              <p className="flex items-center justify-center gap-0.5 text-[11px] font-black text-slate-900">
                <Star className="h-2.5 w-2.5 fill-brand-500 text-brand-500" aria-hidden="true" />
                {trip.driver.rating}
              </p>
              <p className="text-[8px] text-slate-500">Rating</p>
            </div>
            <div>
              <p className="text-[11px] font-black text-slate-900">{trip.driver.score}</p>
              <p className="text-[8px] text-slate-500">Safety</p>
            </div>
            <div>
              <p className={cn('text-[11px] font-black', breaches > 0 ? 'text-brand-600' : 'text-slate-900')}>{breaches}</p>
              <p className="text-[8px] text-slate-500">Breaches</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Max speed</p>
            <p className={cn('mt-0.5 text-base font-black', maxSpeed > trip.ceiling ? 'text-brand-600' : 'text-slate-900')}>
              {maxSpeed}
              <span className="ml-0.5 text-[9px] font-bold text-slate-500">km/h</span>
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Fare locked</p>
            <p className="mt-0.5 text-base font-black text-slate-900">{formatINR(trip.fare)}</p>
          </div>
        </section>

        <p className="px-1 text-center text-[9px] leading-snug text-slate-400">
          Silent SOS also triggers on triple volume-button press. Guardians see route, speed and stops live.
        </p>
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white p-3">
        <div className="flex gap-2">
          <span className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand-200 bg-brand-50 py-3 text-[11px] font-black text-brand-600">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            Guardian
            {sharedCount > 0 && (
              <span className="rounded bg-brand-500 px-1 text-[9px] text-white">{sharedCount}</span>
            )}
          </span>
          <span className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand-800 py-3 text-[11px] font-black text-white">
            <Siren className="h-3.5 w-3.5" aria-hidden="true" />
            Hold for SOS
          </span>
        </div>
      </div>
    </div>
  )
}
