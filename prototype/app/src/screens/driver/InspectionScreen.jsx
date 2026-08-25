import { useEffect, useState } from 'react'
import { ArrowLeft, Camera, Check, MapPin, ShieldCheck } from 'lucide-react'
import { INSPECTION_POINTS } from '../../data/mock.js'
import { cn } from '../../lib/utils.js'
import { useToast } from '../../components/Toast.jsx'

const CAPTURE_MS = 1400
const WATERMARK_GPS = '17.4435° N, 78.3772° E'

export default function InspectionScreen({ onInspectionDone, onBack }) {
  const { toast } = useToast()
  const [captures, setCaptures] = useState({})
  const [capturing, setCapturing] = useState(null)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (capturing === null) return
    const flashTimer = setTimeout(() => setFlash(true), CAPTURE_MS - 350)
    const doneTimer = setTimeout(() => {
      setCaptures((prev) => ({
        ...prev,
        [capturing]: new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
      }))
      setCapturing(null)
      setFlash(false)
    }, CAPTURE_MS)
    return () => {
      clearTimeout(flashTimer)
      clearTimeout(doneTimer)
    }
  }, [capturing])

  const capturedCount = Object.keys(captures).length
  const allDone = capturedCount === INSPECTION_POINTS.length

  const startTrip = () => {
    if (!allDone) {
      toast('Capture all 8 points before starting', 'warning')
      return
    }
    toast('8-point inspection sealed to Trip Vault', 'success')
    onInspectionDone()
  }

  return (
    <div className="relative flex h-full flex-col">
      <header className="flex items-center gap-3 px-4 pb-2 pt-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to handshake"
          className="rounded-full bg-white p-2 text-slate-700 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-black text-slate-900">8-point inspection</h1>
          <p className="text-xs text-slate-500">Watermarked photos · immutable timestamps</p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-lg px-2.5 py-1 text-xs font-black',
            allDone ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700',
          )}
        >
          {capturedCount}/8
        </span>
      </header>

      <div className="px-4 pb-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={capturedCount} aria-valuemin={0} aria-valuemax={8}>
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-300"
            style={{ width: `${(capturedCount / INSPECTION_POINTS.length) * 100}%` }}
          />
        </div>
      </div>

      <ul className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2.5 overflow-y-auto p-4 no-scrollbar">
        {INSPECTION_POINTS.map((point, index) => {
          const capturedAt = captures[index]
          const isCapturing = capturing === index
          return (
            <li key={point}>
              <button
                type="button"
                disabled={isCapturing || Boolean(capturedAt)}
                onClick={() => setCapturing(index)}
                className={cn(
                  'flex h-[104px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center transition-colors',
                  capturedAt
                    ? 'border-brand-300 bg-brand-50'
                    : isCapturing
                      ? 'border-slate-400 bg-slate-100'
                      : 'border-slate-200 bg-white hover:border-slate-300',
                )}
              >
                {capturedAt ? (
                  <>
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100">
                      <Check className="h-5 w-5 text-brand-600" aria-hidden="true" />
                    </span>
                    <span className="text-[11px] font-bold text-slate-900">{point}</span>
                    <span className="text-[9px] text-slate-500">{capturedAt}</span>
                  </>
                ) : (
                  <>
                    <span
                      className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-lg',
                        isCapturing ? 'bg-slate-200' : 'bg-slate-100',
                      )}
                    >
                      <Camera className={cn('h-4 w-4', isCapturing ? 'animate-pulse text-slate-700' : 'text-slate-500')} aria-hidden="true" />
                    </span>
                    <span className="text-[11px] font-bold text-slate-900">{point}</span>
                    <span className="text-[9px] text-slate-500">{isCapturing ? 'Capturing…' : 'Tap to capture'}</span>
                  </>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="border-t border-slate-200 bg-white/95 p-4">
        <button
          type="button"
          onClick={startTrip}
          disabled={!allDone}
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-black transition-colors',
            allDone ? 'bg-brand-500 text-white hover:bg-brand-600' : 'cursor-not-allowed bg-slate-100 text-slate-500',
          )}
        >
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {allDone ? 'Start trip' : `Capture ${8 - capturedCount} more point${8 - capturedCount === 1 ? '' : 's'}`}
        </button>
      </div>

      {capturing !== null && (
        <div className="absolute inset-0 z-[70] flex flex-col items-center justify-center bg-white/95">
          <div className="relative flex h-56 w-56 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300">
            <Camera className="h-14 w-14 text-slate-700" aria-hidden="true" />
            <span className="scan-line absolute left-0 h-0.5 w-full bg-brand-500 shadow-[0_0_12px_#E01E26]" aria-hidden="true" />
            {flash && <span className="shutter-flash absolute inset-0 bg-white" aria-hidden="true" />}
            <span className="absolute bottom-2 left-2 rounded bg-slate-900/80 px-1.5 py-0.5 text-[9px] font-bold text-white">
              {WATERMARK_GPS}
            </span>
          </div>
          <p className="mt-4 text-sm font-black text-slate-900">Capturing: {INSPECTION_POINTS[capturing]}</p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            Stamping GPS + timestamp
          </p>
        </div>
      )}
    </div>
  )
}
