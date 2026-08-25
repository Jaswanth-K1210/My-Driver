import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import AuthLayout from './AuthLayout.jsx'
import { useAuth } from '../context/authStore.js'
import { useToast } from '../context/toastStore.js'
import { cn } from '../lib/utils.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Login() {
  const { signIn } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)

  const from = location.state?.from ?? '/app'

  const validate = () => {
    const next = {}
    if (!EMAIL_RE.test(values.email.trim())) next.email = 'Enter a valid email address'
    if (values.password.length < 6) next.password = 'Password must be at least 6 characters'
    return next
  }

  const submit = (e) => {
    e.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return
    signIn({ email: values.email.trim() })
    toast('Welcome back', 'success')
    navigate(from, { replace: true })
  }

  const set = (key) => (e) => {
    setValues((prev) => ({ ...prev, [key]: e.target.value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to book a driver, track a live trip and open your Trip Vault."
      footer={
        <>
          New to MyDriver?{' '}
          <Link to="/register" className="font-bold text-brand-600 hover:text-brand-700">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field
          id="email"
          label="Email"
          type="email"
          icon={Mail}
          placeholder="you@example.com"
          value={values.email}
          onChange={set('email')}
          error={errors.email}
          autoComplete="email"
        />

        <Field
          id="password"
          label="Password"
          type={showPassword ? 'text' : 'password'}
          icon={Lock}
          placeholder="At least 6 characters"
          value={values.password}
          onChange={set('password')}
          error={errors.password}
          autoComplete="current-password"
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

        <button
          type="submit"
          className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 px-5 py-4 text-sm font-black text-white shadow-lg shadow-brand-500/25 transition-colors hover:bg-brand-600"
        >
          Log in
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
        </button>
      </form>
    </AuthLayout>
  )
}

export function Field({ id, label, icon: Icon, error, trailing, className, ...rest }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />}
        <input
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            'w-full rounded-2xl border bg-slate-50 py-3.5 text-sm font-medium text-slate-900 transition-colors placeholder:text-slate-400 focus:bg-white focus:outline-none',
            Icon ? 'pl-11' : 'pl-4',
            trailing ? 'pr-12' : 'pr-4',
            error ? 'border-brand-400 focus:border-brand-500' : 'border-slate-200 focus:border-brand-400',
            className,
          )}
          {...rest}
        />
        {trailing && <span className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</span>}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-semibold text-brand-600">
          {error}
        </p>
      )}
    </div>
  )
}
