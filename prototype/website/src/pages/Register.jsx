import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, User } from 'lucide-react'
import AuthLayout from './AuthLayout.jsx'
import OtpForm from '../components/app/OtpForm.jsx'
import GoogleButton from '../components/app/GoogleButton.jsx'
import { Field } from '../components/app/Field.jsx'
import { useAuth } from '../context/authStore.js'
import { useToast } from '../context/toastStore.js'

export default function Register() {
  const { requestOtp, verifyOtp, signInWithGoogle } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const done = () => {
    toast('Account created', 'success')
    navigate('/app', { replace: true })
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Verify your mobile number and start booking police-verified drivers."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-brand-600 hover:text-brand-700">
            Log in
          </Link>
        </>
      }
    >
      <OtpForm
        submitLabel="Send code"
        profile={{ name: name.trim(), email: email.trim() }}
        extraFields={
          <>
            <Field
              id="name"
              label="Full name"
              icon={User}
              placeholder="Priya Sharma"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
            <Field
              id="email"
              label="Email (optional)"
              type="email"
              icon={Mail}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </>
        }
        onVerified={{
          requestOtp,
          verifyOtp: async (phone, code, profile) => {
            await verifyOtp(phone, code, profile)
            done()
          },
        }}
      />

      <GoogleButton
        label="Sign up with Google"
        onToken={async (idToken) => {
          await signInWithGoogle(idToken)
          done()
        }}
      />
    </AuthLayout>
  )
}
