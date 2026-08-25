import { useState } from 'react'
import { Bell, BatteryFull, ChevronDown, Clock, Gauge, MapPin, Navigation, Search, Signal, Wifi } from 'lucide-react'
import { CUSTOMER, DROPS, PICKUP, SKILLS, VISION_MODES } from '../../data/mock.js'
import { clamp, cn, formatINR } from '../../lib/utils.js'
import { useToast } from '../../components/Toast.jsx'

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-5 pt-3 text-[11px] font-semibold text-slate-500">
      <span>9:41</span>
      <span className="flex items-center gap-1.5">
        <Signal className="h-3.5 w-3.5" aria-hidden="true" />
        <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
        <BatteryFull className="h-4 w-4" aria-hidden="true" />
      </span>
    </div>
  )
}

function PlaceList({ onSelect }) {
  return (
    <ul className="mt-2 space-y-1">
      {DROPS.map((place) => (
        <li key={place.id}>
          <button
            type="button"
            onClick={() => onSelect(place)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-100"
          >
            <MapPin className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900">{place.name}</span>
              <span className="block truncate text-xs text-slate-500">{place.address}</span>
            </span>
            <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
              {place.distanceKm} km
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export default function HomeScreen({ config, onChange, onFindDriver }) {
  const { toast } = useToast()
  const [dropOpen, setDropOpen] = useState(false)
  const drop = DROPS.find((d) => d.id === config.dropId) ?? null
  const skill = SKILLS.find((s) => s.id === config.skillId)

  const baseFare = drop ? drop.distanceKm * skill.rate : 0
  const nightFee = config.skillId === 'MD-Night' ? 30 : 0
  const total = baseFare + 19 + nightFee

  const handleCeiling = (value) => {
    const next = clamp(Number(value), 40, 120)
    onChange({ ...config, ceiling: next })
  }

  return (
    <div className="flex h-full flex-col">
      <StatusBar />
      <header className="flex items-center justify-between px-5 pb-3 pt-2">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-sm font-black text-brand-600">
            {CUSTOMER.initials}
          </span>
          <div>
            <p className="text-xs text-slate-500">Good evening</p>
            <p className="text-sm font-bold text-slate-900">{CUSTOMER.name}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Notifications"
          onClick={() => toast('No new alerts - all trips sealed', 'info')}
          className="relative rounded-full bg-white p-2.5 text-slate-700 transition-colors hover:text-slate-900"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-brand-600" aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4 no-scrollbar">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-800" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Pickup</p>
              <p className="truncate text-sm font-semibold text-slate-900">{PICKUP.name}</p>
              <p className="truncate text-xs text-slate-500">{PICKUP.address}</p>
            </div>
          </div>
          <div className="my-3 ml-1.5 h-4 w-px bg-slate-200" aria-hidden="true" />
          <div className="flex items-start gap-3">
            <Navigation className="mt-0.5 h-4 w-4 shrink-0 rotate-90 text-brand-500" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 text-left"
                aria-expanded={dropOpen}
                onClick={() => setDropOpen((v) => !v)}
              >
                <span className="min-w-0">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Drop</span>
                  <span className={cn('block truncate text-sm font-semibold', drop ? 'text-slate-900' : 'text-slate-500')}>
                    {drop ? `${drop.name} · ${drop.address}` : 'Where are you heading?'}
                  </span>
                </span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform', dropOpen && 'rotate-180')} aria-hidden="true" />
              </button>
              {dropOpen && (
                <PlaceList
                  onSelect={(place) => {
                    onChange({ ...config, dropId: place.id })
                    setDropOpen(false)
                  }}
                />
              )}
            </div>
          </div>
        </section>

        <section aria-label="Driver skill certification">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Skill certification</h2>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 no-scrollbar">
            {SKILLS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange({ ...config, skillId: s.id })}
                aria-pressed={config.skillId === s.id}
                className={cn(
                  'shrink-0 rounded-xl border px-3.5 py-2 text-left transition-colors',
                  config.skillId === s.id
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-slate-200 bg-white hover:border-slate-300',
                )}
              >
                <span className={cn('block text-xs font-black', config.skillId === s.id ? 'text-brand-600' : 'text-slate-900')}>
                  {s.label}
                </span>
                <span className="block text-[10px] text-slate-500">{s.id}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Speed ceiling">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
              <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
              Speed ceiling
            </h2>
            <span
              className={cn(
                'rounded-md px-2 py-0.5 text-xs font-black',
                config.ceiling > 80 ? 'bg-brand-50 text-brand-700' : 'bg-brand-50 text-brand-600',
              )}
            >
              {config.ceiling} km/h
            </span>
          </div>
          <input
            type="range"
            min="40"
            max="120"
            step="5"
            value={config.ceiling}
            onChange={(e) => handleCeiling(e.target.value)}
            className="w-full accent-brand-500"
            aria-label={`Speed ceiling ${config.ceiling} kilometres per hour`}
          />
          <p className="mt-1 text-[11px] leading-snug text-slate-500">
            Breaches alert you, your guardians and the Safety Desk instantly.
          </p>
        </section>

        <section aria-label="VisionCam mode">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">VisionCam mode</h2>
          <div className="grid grid-cols-3 gap-2">
            {VISION_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => onChange({ ...config, visionMode: mode.id })}
                aria-pressed={config.visionMode === mode.id}
                className={cn(
                  'rounded-xl border p-2.5 text-center transition-colors',
                  config.visionMode === mode.id
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-slate-200 bg-white hover:border-slate-300',
                )}
              >
                <span className={cn('block text-sm font-black', config.visionMode === mode.id ? 'text-brand-600' : 'text-slate-900')}>
                  Mode {mode.id}
                </span>
                <span className="block text-[10px] text-slate-500">{mode.name}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {VISION_MODES.find((m) => m.id === config.visionMode)?.desc} · sealed into Trip Vault
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Fare estimate">
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-500">
              <span>Trip distance</span>
              <span className="font-semibold text-slate-700">{drop ? `${drop.distanceKm} km` : '--'}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>{skill.id} rate</span>
              <span className="font-semibold text-slate-700">{formatINR(skill.rate)}/km</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Platform fee</span>
              <span className="font-semibold text-slate-700">{formatINR(19)}</span>
            </div>
            {nightFee > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Night monitoring</span>
                <span className="font-semibold text-slate-700">{formatINR(nightFee)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-sm">
              <span className="font-bold text-slate-900">Estimated fare</span>
              <span className="font-black text-brand-600">{drop ? formatINR(total) : '--'}</span>
            </div>
          </div>
        </section>
      </div>

      <div className="border-t border-slate-200 bg-white/95 p-4">
        <button
          type="button"
          disabled={!drop}
          onClick={onFindDriver}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-black transition-colors',
            drop ? 'bg-brand-500 text-white hover:bg-brand-600' : 'cursor-not-allowed bg-slate-100 text-slate-500',
          )}
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          Find my {skill.label} driver
        </button>
        {!drop && <p className="mt-2 text-center text-[11px] text-slate-400">Choose a destination to continue</p>}
      </div>
    </div>
  )
}

export function MatchingOverlay() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-white">
      <span className="relative flex h-20 w-20 text-brand-500">
        <span className="pulse-ring absolute inline-flex h-20 w-20 rounded-full" />
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50">
          <Search className="h-8 w-8" aria-hidden="true" />
        </span>
      </span>
      <div className="text-center">
        <p className="text-base font-bold text-slate-900">Matching a certified driver…</p>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          Usually under 20 seconds
        </p>
      </div>
      <ul className="w-full max-w-[240px] space-y-2 text-left">
        {['Police background check', 'Face-match handshake armed', 'VisionCam standby'].map((item) => (
          <li key={item} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-[11px] font-semibold text-slate-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-600" aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
