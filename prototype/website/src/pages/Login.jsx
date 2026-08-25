import { useNavigate, useLocation, Link } from 'react-router-dom'
import AuthLayout from './AuthLayout.jsx'
import OtpForm from '../components/app/OtpForm.jsx'
import GoogleButton from '../components/app/GoogleButton.jsx'
import { useAuth } from '../context/authStore.js'
import { useToast } from '../context/toastStore.js'

// Re-exported so existing imports of `Field` from this module keep working.
export { Field } from '../components/app/Field.jsx'

export default function Login() {
  const { requestOtp, verifyOtp, signInWithGoogle } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const from = location.state?.from ?? '/app'

  const done = () => {
    toast('Welcome back', 'success')
    navigate(from, { replace: true })
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
      <OtpForm
        submitLabel="Send code"
        onVerified={{
          requestOtp,
          verifyOtp: async (phone, code) => {
            await verifyOtp(phone, code)
            done()
          },
        }}
      />

      <GoogleButton
        label="Continue with Google"
        onToken={async (idToken) => {
          await signInWithGoogle(idToken)
          done()
        }}
      />
    </AuthLayout>
  )
}
