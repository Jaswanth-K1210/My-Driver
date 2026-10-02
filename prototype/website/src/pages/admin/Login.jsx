import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import AuthLayout from '../AuthLayout.jsx'
import { Field } from '../../components/app/Field.jsx'
import { useAuth } from '../../context/authStore.js'
import { useToast } from '../../context/toastStore.js'
import { ApiError } from '../../lib/apiClient.js'

/**
 * Operators sign in separately from customers, with credentials issued by
 * `npm run seed:staff`. There is no signup and no role picker: the server
 * starts the session in the broadest role the account holds.
 */
export default function AdminLogin() {
  const { staffLogin } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const me = await staffLogin(email, password)
      // Finance has no live board, so it lands on its own screen.
      const home = me?.role === 'FINANCE' ? '/admin/payouts' : '/admin'
      navigate(location.state?.from ?? home, { replace: true })
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Sign-in failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Admin portal sign-in"
      subtitle="For MyDriver staff. Use the credentials issued to you."
      footer={
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Every action on this portal is written to the audit ledger.
        </span>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field
          id="admin-email"
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@mydriver.test"
          type="email"
          autoComplete="username"
        />
        <Field
          id="admin-password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          autoComplete="current-password"
        />
        <button
          type="submit"
          disabled={busy || !email || !password}
          className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-40"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  )
}
