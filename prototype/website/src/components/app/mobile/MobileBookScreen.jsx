import { Gauge, MapPin, Navigation, Search } from 'lucide-react'
import { PICKUP, SKILLS, VISION_MODES } from '../../../data/mock.js'
import { dropFor, packageFor } from '../../../lib/booking.js'
import { cn, formatINR } from '../../../lib/utils.js'

/**
 * Read-only rendering of the mobile app's booking screen, driven by the same
 * config object as the web form so the preview always matches what is on the
 * left. Interaction lives on the web form; this mirrors it.
 */
export default function MobileBookScreen({ config, quote, visionMode }) {
  const drop = dropFor(config.dropId)
  const pkg = packageFor(config.packageId)
  const destination =
    config.mode === 'hour' ? `${pkg.hours}-hour hire · ${pkg.includedKm} km` : (drop ? drop.name : 'Where are you heading?')

  return (
    <div className="flex h-full flex-col bg-white">
      <header className="flex shrink-0 items-center gap-3 px-5 pb-3 pt-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-xs font-black text-brand-600">
          PS
        </span>
        <div className="min-w-0">
          <p className="text-[10px] text-slate-500">Good evening</p>
          <p className="truncate text-xs font-bold text-slate-900">Priya Sharma</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4 no-scrollbar">
        <section className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="flex items-start gap-2.5">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Pickup</p>
              <p className="truncate text-xs font-semibold text-slate-900">{PICKUP.address}</p>
            </div>
          </div>
          <div className="my-2.5 ml-1.5 h-3 w-px bg-slate-200" aria-hidden="true" />
          <div className="flex items-start gap-2.5">
            <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0 rotate-90 text-brand-500" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {config.mode === 'hour' ? 'Package' : 'Drop'}
              </p>
              <p className={cn('truncate text-xs font-semibold', drop || config.mode === 'hour' ? 'text-slate-900' : 'text-slate-400')}>
                {destination}
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Skill certification</h2>
          <div className="-mx-4 flex min-w-0 gap-1.5 overflow-x-auto px-4 pb-1 no-scrollbar">
            {SKILLS.map((s) => {
              const selected = s.id === config.skillId
              return (
                <span
                  key={s.id}
                  className={cn(
                    'shrink-0 rounded-xl border px-2.5 py-1.5',
                    selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white',
                  )}
                >
                  <span className={cn('block text-[10px] font-black', selected ? 'text-brand-600' : 'text-slate-900')}>
                    {s.label}
                  </span>
                  <span className="block text-[9px] text-slate-500">{s.id}</span>
                </span>
              )
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <Gauge className="h-3 w-3" aria-hidden="true" />
              Speed ceiling
            </span>
            <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-black text-brand-600">
              {config.ceiling} km/h
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100">
            <div
              className="h-1.5 rounded-full bg-brand-500"
              style={{ width: `${((config.ceiling - 40) / 80) * 100}%` }}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">VisionCam mode</h2>
          <div className="grid grid-cols-3 gap-1.5">
            {VISION_MODES.map((mode) => {
              const selected = mode.id === config.visionMode
              return (
                <span
                  key={mode.id}
                  className={cn(
                    'rounded-xl border p-2 text-center',
                    selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white',
                  )}
                >
                  <span className={cn('block text-[11px] font-black', selected ? 'text-brand-600' : 'text-slate-900')}>
                    {mode.id}
                  </span>
                  <span className="block text-[8px] text-slate-500">{mode.name}</span>
                </span>
              )
            })}
          </div>
          <p className="mt-1 text-[9px] text-slate-500">{visionMode?.desc}</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="space-y-1 text-[10px]">
            {quote.lines.map((line) => (
              <div key={line.label} className="flex justify-between text-slate-500">
                <span>{line.label}</span>
                <span className="font-semibold text-slate-700">{line.value}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-xs">
              <span className="font-bold text-slate-900">Estimated fare</span>
              <span className="font-black text-brand-600">{quote.ready ? formatINR(quote.total) : '--'}</span>
            </div>
          </div>
        </section>
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white p-3.5">
        <span
          className={cn(
            'flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-black',
            quote.ready ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-400',
          )}
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          Find my {quote.skill.label} driver
        </span>
      </div>
    </div>
  )
}
