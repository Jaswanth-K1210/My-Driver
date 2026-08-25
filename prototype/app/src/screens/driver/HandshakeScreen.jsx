import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, KeyRound, ScanFace, ShieldCheck } from 'lucide-react'
import { DEMO_OTP } from '../../data/mock.js'
import { cn } from '../../lib/utils.js'
import { useToast } from '../../components/Toast.jsx'

const OTP_LENGTH = 4

export default function HandshakeScreen({ request, onVerified, onBack }) {
  const { toast } = useToast()
  const [scanStage, setScanStage] = useState('idle')
  const [otp, setOtp] = useState(['', '', '', ''])
  const [otpError, setOtpError] = useState(false)
  const inputsRef = useRef([])

  useEffect(() => {
    if (scanStage !== 'scanning') return
    const t = setTimeout(() => {
      setScanStage('matched')
      toast('Face match verified against master profile', 'success')
    }, 2000)
    return () => clearTimeout(t)
  }, [scanStage, toast])

  const setDigit = (index, raw) => {
    const digit = raw.replace(/\D/g, '').slice(-1)
    setOtp((prev) => {
      const next = [...prev]
      next[index] = digit
      return next
    })
    setOtpError(false)
    if (digit && index < OTP_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !otp[index] && index > 0) {
      inputsRef.current[index - 1]?.focus()
    }
  }

  const verify = () => {
    const entered = otp.join('')
    if (entered.length < OTP_LENGTH) {
      toast('Enter the full 4-digit OTP', 'warning')
      return
    }
    if (entered !== DEMO_OTP) {
      setOtpError(true)
      toast('Incorrect OTP - ask the customer again', 'danger')
      return
    }
    toast('Handshake complete - proceed to inspection', 'success')
    onVerified()
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 px-4 pb-2 pt-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to requests"
          className="rounded-full bg-white p-2 text-slate-700 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div>
          <h1 className="text-base font-black text-slate-900">Pickup handshake</h1>
          <p className="text-xs text-slate-500">{request.customer} · {request.pickup}</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3 no-scrollbar">
        <section className="rounded-2xl border border-slate-200 bg-white p-4" aria-label="Liveness check">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
              <ScanFace className="h-3.5 w-3.5" aria-hidden="true" />
              Step 1 · Liveness check
            </h2>
            {scanStage === 'matched' && (
              <span className="flex items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-[10px] font-black text-brand-600">
                <Check className="h-3 w-3" aria-hidden="true" />
                Matched
              </span>
            )}
          </div>
          <div className="relative mx-auto flex h-40 w-full max-w-[240px] items-center justify-center overflow-hidden rounded-xl border border-slate-300 bg-white">
            <ScanFace className={cn('h-16 w-16', scanStage === 'matched' ? 'text-brand-500' : 'text-slate-400')} aria-hidden="true" />
            {scanStage === 'scanning' && (
              <>
                <span className="scan-line absolute left-0 h-0.5 w-full bg-brand-600 shadow-[0_0_12px_#E01E26]" aria-hidden="true" />
                <span className="absolute bottom-2 text-[10px] font-bold text-brand-600">Scanning face…</span>
              </>
            )}
            {scanStage === 'idle' && (
              <span className="absolute bottom-2 text-[10px] font-semibold text-slate-500">Camera standby</span>
            )}
          </div>
          <button
            type="button"
            disabled={scanStage === 'scanning'}
            onClick={() => setScanStage('scanning')}
            className={cn(
              'mt-3 w-full rounded-xl py-3 text-xs font-black transition-colors',
              scanStage === 'matched'
                ? 'bg-slate-100 text-brand-600'
                : scanStage === 'scanning'
                  ? 'cursor-wait bg-slate-100 text-slate-500'
                  : 'bg-brand-500 text-white hover:bg-brand-600',
            )}
          >
            {scanStage === 'matched' ? 'Identity confirmed' : scanStage === 'scanning' ? 'Verifying…' : 'Start face match'}
          </button>
        </section>

        <section className={cn('rounded-2xl border p-4 transition-opacity', scanStage === 'matched' ? 'border-slate-200 bg-white' : 'border-slate-200 bg-white opacity-50')} aria-label="Customer OTP">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              Step 2 · Customer OTP
            </h2>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-700">Demo OTP: {DEMO_OTP}</span>
          </div>
          <p className="mb-3 text-[11px] leading-snug text-slate-500">
            Engine start stays locked until the customer shares their trip OTP.
          </p>
          <div className={cn('flex justify-center gap-3', otpError && 'shake-x')} role="group" aria-label="OTP entry">
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputsRef.current[i] = el
                }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={2}
                value={digit}
                disabled={scanStage !== 'matched'}
                onChange={(e) => setDigit(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                aria-label={`OTP digit ${i + 1}`}
                className={cn(
                  'h-14 w-12 rounded-xl border bg-white text-center text-xl font-black text-slate-900 focus:outline-none',
                  otpError ? 'border-brand-700' : digit ? 'border-brand-500' : 'border-slate-300',
                  'focus:border-brand-400',
                )}
              />
            ))}
          </div>
          <button
            type="button"
            disabled={scanStage !== 'matched'}
            onClick={verify}
            className={cn(
              'mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-black transition-colors',
              scanStage === 'matched'
                ? 'bg-brand-500 text-white hover:bg-brand-600'
                : 'cursor-not-allowed bg-slate-100 text-slate-400',
            )}
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Verify & unlock engine
          </button>
        </section>
      </div>
    </div>
  )
}
