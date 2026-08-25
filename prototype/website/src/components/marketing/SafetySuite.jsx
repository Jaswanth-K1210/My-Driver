import { Gauge, Camera, Users, Siren, ClipboardCheck, Archive } from 'lucide-react'
import Reveal from './Reveal.jsx'
import { SAFETY_FEATURES } from '../../data/mock.js'

const ICONS = { gauge: Gauge, camera: Camera, users: Users, siren: Siren, clipboard: ClipboardCheck, archive: Archive }

export default function SafetySuite() {
  return (
    <section id="safety" className="bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-600">Safety infrastructure</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Not just tracking. A full integrity stack.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Six layers of protection run on every trip — configured by you, enforced by hardware, witnessed by our
            24x7 Safety Desk.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {SAFETY_FEATURES.map((feature, i) => {
            const Icon = ICONS[feature.icon]
            return (
              <Reveal
                as="article"
                key={feature.title}
                delay={(i % 3) * 100}
                className="rounded-3xl border border-slate-200 bg-white p-7 transition-colors duration-200 hover:border-brand-200"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-bold text-slate-900">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.description}</p>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
