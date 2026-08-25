import { useState } from 'react'
import { Archive, Check, Star } from 'lucide-react'
import MapCanvas from '../../components/MapCanvas.jsx'
import { useToast } from '../../components/Toast.jsx'
import { cn, formatINR } from '../../lib/utils.js'

export default function TripCompleteScreen({ trip, summary, onSave }) {
  const { toast } = useToast()
  const [rating, setRating] = useState(0)

  return (
    <div className="flex h-full flex-col">
      <header className="px-5 pb-2 pt-6 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50">
          <Check className="h-7 w-7 text-brand-500" aria-hidden="true" />
        </span>
        <h1 className="mt-3 text-lg font-black text-slate-900">You have arrived</h1>
        <p className="text-xs text-slate-500">Trip {trip.id} · sealed into your Trip Vault</p>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 no-scrollbar">
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <MapCanvas progress={100} className="h-36 w-full" />
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Trip summary">
          <div className="grid grid-cols-2 gap-y-3 text-xs">
            <div>
              <p className="text-slate-500">Fare paid</p>
              <p className="text-sm font-black text-slate-900">{formatINR(trip.fare)}</p>
            </div>
            <div>
              <p className="text-slate-500">Max speed</p>
              <p className={cn('text-sm font-black', summary.maxSpeed > trip.ceiling ? 'text-brand-700' : 'text-slate-900')}>
                {summary.maxSpeed} km/h
                <span className="ml-1 text-[10px] font-bold text-slate-500">/ {trip.ceiling}</span>
              </p>
            </div>
            <div>
              <p className="text-slate-500">Ceiling breaches</p>
              <p className={cn('text-sm font-black', summary.breaches > 0 ? 'text-brand-700' : 'text-brand-600')}>
                {summary.breaches}
              </p>
            </div>
            <div>
              <p className="text-slate-500">VisionCam</p>
              <p className="text-sm font-black text-slate-900">Mode {trip.visionMode}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 text-center" aria-label="Rate driver">
          <p className="text-xs font-semibold text-slate-500">
            How was {trip.driver.name}?
          </p>
          <div className="mt-2 flex justify-center gap-1.5" role="radiogroup" aria-label="Driver rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                onClick={() => setRating(n)}
                className="p-1 transition-transform hover:scale-110"
              >
                <Star
                  className={cn('h-7 w-7', n <= rating ? 'fill-brand-500 text-brand-500' : 'text-slate-700')}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="border-t border-slate-200 bg-white/95 p-4">
        <button
          type="button"
          onClick={onSave}
          disabled={rating === 0}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-black transition-colors',
            rating === 0 ? 'cursor-not-allowed bg-slate-100 text-slate-500' : 'bg-brand-500 text-white hover:bg-brand-600',
          )}
        >
          <Archive className="h-4 w-4" aria-hidden="true" />
          {rating === 0 ? 'Rate your driver to finish' : 'Save to Trip Vault'}
        </button>
        <button
          type="button"
          onClick={() => toast('Receipt sent to your email (demo)', 'info')}
          className="mt-2 w-full rounded-xl py-2.5 text-xs font-bold text-slate-500 transition-colors hover:text-slate-900"
        >
          Email me the receipt
        </button>
      </div>
    </div>
  )
}
