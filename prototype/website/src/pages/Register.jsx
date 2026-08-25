import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, Lock, Mail, Phone, UserRound } from 'lucide-react'
import AuthLayout from './AuthLayout.jsx'
import { Field } from './Login.jsx'
import { useAuth } from '../context/authStore.js'
import { useToast } from '../context/toastStore.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Register() {
  const { signUp } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [values, setValues] = useState({ name: '', email: '', phone: '', password: '' })
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [accepted, setAccepted] = useState(false)

  const validate = () => {
    const next = {}
    if (values.name.trim().length < 2) next.name = 'Enter your full name'
    if (!EMAIL_RE.test(values.email.trim())) next.email = 'Enter a valid email address'
    if (values.phone.replace(/\D/g, '').length !== 10) next.phone = 'Enter a 10-digit mobile number'
    if (values.password.length < 6) next.password = 'Password must be at least 6 characters'
    if (!accepted) next.accepted = 'Please accept the terms to continue'
    return next
  }

  const submit = (e) => {
    e.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return
    signUp({
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.replace(/\D/g, ''),
    })
    toast('Account created — welcome to MyDriver', 'success')
    navigate('/app', { replace: true })
  }

  const set = (key) => (e) => {
    setValues((prev) => ({ ...prev, [key]: e.target.value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Book certified drivers, track every trip live and keep a sealed record of each ride."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-brand-600 hover:text-brand-700">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field id="name" label="Full name" icon={UserRound} placeholder="Priya Sharma" value={values.name} onChange={set('name')} error={errors.name} autoComplete="name" />
        <Field id="email" label="Email" type="email" icon={Mail} placeholder="you@example.com" value={values.email} onChange={set('email')} error={errors.email} autoComplete="email" />
        <Field id="phone" label="Mobile number" type="tel" icon={Phone} placeholder="9848012345" inputMode="numeric" maxLength={14} value={values.phone} onChange={set('phone')} error={errors.phone} autoComplete="tel" />
        <Field
          id="password"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          icon={Lock}
          placeholder="At least 6 characters"
          value={values.password}
          onChange={set('password')}
          error={errors.password}
          autoComplete="new-password"
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />

        <div>
          <label className="flex items-start gap-3 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => {
                setAccepted(e.target.checked)
                setErrors((prev) => ({ ...prev, accepted: undefined }))
              }}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-500"
              aria-invalid={Boolean(errors.accepted)}
            />
            <span>
              I agree to the <span className="font-semibold text-slate-900">Terms of Service</span> and{' '}
              <span className="font-semibold text-slate-900">Privacy Policy</span>.
            </span>
          </label>
          {errors.accepted && <p className="mt-1.5 text-xs font-semibold text-brand-600">{errors.accepted}</p>}
        </div>

        <button
          type="submit"
          className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 py-4 text-sm font-black text-white shadow-lg shadow-brand-500/25 transition-colors hover:bg-brand-600"
        >
          Create account
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
        </button>
      </form>
    </AuthLayout>
  )
}
