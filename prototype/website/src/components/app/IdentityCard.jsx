import { useCallback, useEffect, useState } from 'react'
import { Fingerprint } from 'lucide-react'
import { SectionCard } from './Primitives.jsx'
import Field from './Field.jsx'
import { useAuth } from '../../context/authStore.js'
import { useToast } from '../../context/toastStore.js'
import { api } from '../../lib/apiClient.js'

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/

const btn =
  'inline-flex h-12 items-center justify-center rounded-2xl bg-slate-900 px-5 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40'

/** Optional for customers: earns the "ID verified" badge. Same flow drivers use. */
export default function IdentityCard({ onStatus }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [status, setStatus] = useState(null)
  const [pan, setPan] = useState('')
  const [name, setName] = useState(user?.name ?? '')
  const [aadhaar, setAadhaar] = useState('')
  const [refId, setRefId] = useState(null)
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      const next = await api.kyc.status()
      setStatus(next)
      onStatus?.(next)
    } catch {
      // Offline: hide the card rather than show a broken form.
    }
  }, [onStatus])

  useEffect(() => {
    void reload()
  }, [reload])

  const run = async (fn, ok) => {
    setBusy(true)
    try {
      await fn()
      if (ok) toast(ok, 'success')
      await reload()
    } catch (err) {
      toast(err?.message ?? 'Verification failed', 'warning')
    } finally {
      setBusy(false)
    }
  }

  if (!status) return null
  const panDone = status.pan.status === 'VERIFIED'
  const aadhaarDone = status.aadhaar.status === 'VERIFIED'

  return (
    <SectionCard title="Identity · optional" icon={Fingerprint}>
      {status.verified ? (
        <p className="text-sm text-slate-600">
          PAN ending <span className="font-semibold text-slate-900">{status.pan.last4}</span> and Aadhaar ending{' '}
          <span className="font-semibold text-slate-900">{status.aadhaar.last4}</span> are verified. Your driver sees an
          ID-verified badge.
        </p>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-slate-600">
            Verify your identity to show drivers an ID-verified badge. Checks run through a licensed partner, and we keep
            only the last four characters.
          </p>

          {panDone ? (
            <p className="text-sm font-semibold text-slate-900">✓ PAN ending {status.pan.last4}</p>
          ) : (
            <form
              className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault()
                void run(() => api.kyc.verifyPan(pan, name.trim()), 'PAN verified')
              }}
            >
              <Field id="kyc-name" label="Name as on PAN" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              <Field
                id="kyc-pan"
                label="PAN"
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
                placeholder="ABCPE1234F"
                className="tracking-widest"
              />
              <button type="submit" disabled={busy || !PAN_RE.test(pan) || name.trim().length < 2} className={btn}>
                Verify PAN
              </button>
            </form>
          )}

          {aadhaarDone ? (
            <p className="text-sm font-semibold text-slate-900">✓ Aadhaar ending {status.aadhaar.last4}</p>
          ) : !refId ? (
            <form
              className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault()
                void run(async () => setRefId((await api.kyc.requestAadhaarOtp(aadhaar)).ref_id), 'OTP sent to your Aadhaar-linked mobile')
              }}
            >
              <Field
                id="kyc-aadhaar"
                label="Aadhaar number"
                inputMode="numeric"
                value={aadhaar.replace(/(\d{4})(?=\d)/g, '$1 ')}
                onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, '').slice(0, 12))}
                placeholder="1234 5678 9012"
                className="tracking-widest"
              />
              <button type="submit" disabled={busy || aadhaar.length !== 12} className={btn}>
                Send OTP
              </button>
            </form>
          ) : (
            <form
              className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault()
                void run(() => api.kyc.verifyAadhaarOtp(refId, otp), 'Aadhaar verified')
              }}
            >
              <Field
                id="kyc-otp"
                label={`OTP sent to the mobile linked to Aadhaar ending ${aadhaar.slice(-4)}`}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="tracking-[0.5em]"
              />
              <button type="submit" disabled={busy || otp.length !== 6} className={btn}>
                Verify Aadhaar
              </button>
            </form>
          )}
        </div>
      )}
    </SectionCard>
  )
}
