import { useState } from 'react'
import { ArrowRight, Phone, ShieldCheck } from 'lucide-react'
import { Field } from './Field.jsx'
import { useToast } from '../../context/toastStore.js'
import { GOOGLE_ENABLED } from '../../lib/config.js'
import { ApiError } from '../../lib/apiClient.js'
import { toE164 } from '../../lib/phone.js'

const describe = (err) =>
  err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'

/**
 * Shared phone + OTP form for both login and signup. `extraFields` lets the
 * signup screen collect a name and email before the code is sent.
 */
export default function OtpForm({ submitLabel, onVerified, extraFields, profile }) {
  const { toast } = useToast()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const { requestOtp, verifyOtp } = onVerified

  const send = async (e) => {
    e.preventDefault()
    setError('')
    const e164 = toE164(phone)
    if (e164.replace(/\D/g, '').length < 10) {
      setError('Enter a valid 10-digit mobile number')
      return
    }
    setBusy(true)
    try {
      await requestOtp(e164)
      setSent(true)
      toast('Verification code sent', 'success')
    } catch (err) {
      setError(describe(err))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (e) => {
    e.preventDefault()
    setError('')
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code')
      return
    }
    setBusy(true)
    try {
      await verifyOtp(toE164(phone), code, profile)
    } catch (err) {
      setError(describe(err))
    } finally {
      setBusy(false)
    }
  }

  if (!sent) {
    return (
      <form onSubmit={send} noValidate className="space-y-4">
        {extraFields}
        <Field
          id="phone"
          label="Mobile number"
          type="tel"
          icon={Phone}
          placeholder="98765 43210"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value)
            setError('')
          }}
          error={error}
          autoComplete="tel"
        />
        <button
          type="submit"
          disabled={busy}
          className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 py-4 text-sm font-black text-white shadow-lg shadow-brand-500/25 transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
        >
          {busy ? 'Sending…' : submitLabel}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
        </button>

        {!GOOGLE_ENABLED && (
          <p className="text-center text-xs text-slate-500">
            Google sign-in is not configured yet — set <code className="font-mono">VITE_GOOGLE_CLIENT_ID</code>.
          </p>
        )}
      </form>
    )
  }

  return (
    <form onSubmit={verify} noValidate className="space-y-4">
      <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        We sent a 6-digit code to <span className="font-bold text-slate-900">{toE164(phone)}</span>.
      </p>
      <Field
        id="otp"
        label="Verification code"
        type="text"
        inputMode="numeric"
        icon={ShieldCheck}
        placeholder="123456"
        maxLength={6}
        value={code}
        onChange={(e) => {
          setCode(e.target.value.replace(/\D/g, ''))
          setError('')
        }}
        error={error}
        autoComplete="one-time-code"
      />
      <button
        type="submit"
        disabled={busy}
        className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 py-4 text-sm font-black text-white shadow-lg shadow-brand-500/25 transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none"
      >
        {busy ? 'Verifying…' : 'Verify & continue'}
        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => {
          setSent(false)
          setCode('')
          setError('')
        }}
        className="w-full text-center text-xs font-semibold text-brand-600 hover:text-brand-700"
      >
        Change number
      </button>
    </form>
  )
}
