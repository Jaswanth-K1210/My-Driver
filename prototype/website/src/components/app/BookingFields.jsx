import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Clock, Gauge, MapPin, Navigation } from 'lucide-react'
import { DROPS, HOUR_PACKAGES, PICKUP, PICKUP_TIMES, SKILLS, VISION_MODES } from '../../data/mock.js'
import { clamp, cn } from '../../lib/utils.js'

/** Dropdown of saved destinations, closing on outside click and Escape. */
export function DropPicker({ value, onChange, size = 'md' }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const drop = DROPS.find((d) => d.id === value) ?? null

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 text-left transition-colors hover:border-slate-300 focus:border-brand-400 focus:bg-white focus:outline-none',
          size === 'lg' ? 'px-4 py-4' : 'px-4 py-3.5',
        )}
      >
        <Navigation className="h-4 w-4 shrink-0 rotate-90 text-brand-500" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Drop</span>
          <span className={cn('block truncate text-sm font-semibold', drop ? 'text-slate-900' : 'text-slate-400')}>
            {drop ? `${drop.name} · ${drop.address}` : 'Where are you heading?'}
          </span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="rise-in absolute inset-x-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10"
        >
          {DROPS.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                role="option"
                aria-selected={place.id === value}
                onClick={() => {
                  onChange(place.id)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
              >
                <MapPin className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{place.name}</span>
                  <span className="block truncate text-xs text-slate-500">{place.address}</span>
                </span>
                <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                  {place.distanceKm} km
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PickupField({ size = 'md' }) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50',
        size === 'lg' ? 'px-4 py-4' : 'px-4 py-3.5',
      )}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full border-[3px] border-brand-500" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Pickup</span>
        <span className="block truncate text-sm font-semibold text-slate-900">{PICKUP.address}</span>
      </span>
    </div>
  )
}

export function PackagePicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {HOUR_PACKAGES.map((pkg) => {
        const selected = pkg.id === value
        return (
          <button
            key={pkg.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(pkg.id)}
            className={cn(
              'rounded-2xl border p-3 text-center transition-colors',
              selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300',
            )}
          >
            <span className={cn('block text-base font-black', selected ? 'text-brand-600' : 'text-slate-900')}>
              {pkg.hours}h
            </span>
            <span className="block text-[10px] font-semibold text-slate-500">{pkg.includedKm} km</span>
          </button>
        )
      })}
    </div>
  )
}

export function TimePicker({ value, onChange, size = 'md' }) {
  return (
    <div className="relative">
      <Clock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <select
        aria-label="Pickup time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-10 text-sm font-semibold text-slate-900 transition-colors hover:border-slate-300 focus:border-brand-400 focus:bg-white focus:outline-none',
          size === 'lg' ? 'py-4' : 'py-3.5',
        )}
      >
        {PICKUP_TIMES.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
    </div>
  )
}

export function SkillPicker({ value, onChange }) {
  return (
    <div className="flex w-full min-w-0 gap-2 overflow-x-auto pb-1 no-scrollbar">
      {SKILLS.map((s) => {
        const selected = s.id === value
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(s.id)}
            className={cn(
              'shrink-0 rounded-2xl border px-4 py-2.5 text-left transition-colors',
              selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300',
            )}
          >
            <span className={cn('block text-sm font-black', selected ? 'text-brand-600' : 'text-slate-900')}>
              {s.label}
            </span>
            <span className="block text-[10px] font-semibold text-slate-500">{s.eta}</span>
          </button>
        )
      })}
    </div>
  )
}

export function CeilingSlider({ value, onChange }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
          <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
          Speed ceiling
        </span>
        <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-black text-brand-600">{value} km/h</span>
      </div>
      <input
        type="range"
        min="40"
        max="120"
        step="5"
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value), 40, 120))}
        className="w-full accent-brand-500"
        aria-label={`Speed ceiling ${value} kilometres per hour`}
      />
      <p className="mt-1.5 text-xs text-slate-500">
        Breaches alert you, your guardians and the Safety Desk instantly.
      </p>
    </div>
  )
}

export function VisionPicker({ value, onChange }) {
  const active = VISION_MODES.find((m) => m.id === value)
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {VISION_MODES.map((mode) => {
          const selected = mode.id === value
          return (
            <button
              key={mode.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(mode.id)}
              className={cn(
                'relative rounded-2xl border p-3 text-center transition-colors',
                selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:border-slate-300',
              )}
            >
              {selected && (
                <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-brand-500" aria-hidden="true" />
              )}
              <span className={cn('block text-sm font-black', selected ? 'text-brand-600' : 'text-slate-900')}>
                Mode {mode.id}
              </span>
              <span className="block text-[10px] font-semibold text-slate-500">{mode.name}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">{active?.desc} · sealed into Trip Vault</p>
    </div>
  )
}
