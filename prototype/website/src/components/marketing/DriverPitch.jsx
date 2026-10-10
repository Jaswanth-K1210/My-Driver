import { Fingerprint, Smartphone, UserCheck } from 'lucide-react'
import Reveal from './Reveal.jsx'
import { PAGE_X } from './Navbar.jsx'

// Drivers do everything in the driver app: sign-up, verification and trips.
// The website only points them there.
const STEPS = [
  { icon: Smartphone, title: 'Get the driver app', description: 'Download MyDriver Partner and sign in with your mobile number.' },
  { icon: Fingerprint, title: 'Verify your identity', description: 'Verify your PAN and Aadhaar in the app and upload your driving licence.' },
  { icon: UserCheck, title: 'Get approved', description: 'Our team reviews your licence. Once approved, go online and accept trips.' },
]

function StoreButton({ store, label }) {
  return (
    <span
      aria-disabled="true"
      className="inline-flex h-12 cursor-not-allowed items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-left opacity-80"
    >
      <span className="text-[11px] font-bold uppercase leading-tight tracking-wide text-slate-500">
        {store}
        <span className="block text-sm normal-case tracking-normal text-slate-900">{label}</span>
      </span>
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
        Coming soon
      </span>
    </span>
  )
}

export default function DriverPitch() {
  return (
    <section id="drivers" className="bg-white py-20 sm:py-28">
      <div className={PAGE_X}>
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.2fr]">
          <Reveal>
            <p className="text-sm font-bold uppercase tracking-widest text-brand-600">For drivers</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Join as a driver</h2>
            <p className="mt-4 max-w-md text-lg text-slate-600">
              Drive customers in their own cars. Sign-up, verification and trips all happen in the MyDriver Partner app.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <StoreButton store="Google Play" label="MyDriver Partner" />
              <StoreButton store="App Store" label="MyDriver Partner" />
            </div>
          </Reveal>

          <ol className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <Reveal as="li" key={step.title} delay={i * 100} className="rounded-3xl border border-slate-200 bg-white p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <step.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-4 text-xs font-bold text-slate-400">Step {i + 1}</p>
                <h3 className="mt-1 font-bold text-slate-900">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{step.description}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
