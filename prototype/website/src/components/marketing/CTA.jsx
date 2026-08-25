import { Link } from 'react-router-dom'
import { ArrowRight, ShieldCheck, Smartphone } from 'lucide-react'
import Reveal from './Reveal.jsx'

export default function CTA() {
  return (
    <section id="download" className="bg-white pb-20 sm:pb-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="relative overflow-hidden rounded-[2.5rem] border border-brand-200 bg-brand-50 px-6 py-20 sm:px-12 sm:py-24">
          <div className="relative mx-auto max-w-2xl text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 shadow-lg shadow-brand-500/25">
              <ShieldCheck className="h-7 w-7 text-white" aria-hidden="true" />
            </span>
            <h2 className="mt-6 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Ride with proof, tonight.</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
              Create your account, set your first speed ceiling and share a guardian link in under two minutes.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/register"
                className="group flex items-center gap-2 rounded-full bg-brand-500 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-500/25 transition-colors hover:bg-brand-600"
              >
                Create free account
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
              </Link>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-7 py-3.5 text-sm font-bold text-slate-900 transition-colors hover:border-slate-400"
              >
                <Smartphone className="h-4 w-4" aria-hidden="true" />
                Get the app
              </button>
            </div>
            <p className="mt-7 text-xs text-slate-500">Prototype build — store buttons are placeholders.</p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
