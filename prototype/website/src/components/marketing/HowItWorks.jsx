import Reveal from './Reveal.jsx'
import { STEPS } from '../../data/mock.js'

export default function HowItWorks() {
  return (
    <section id="how" className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-600">How it works</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Three steps to a provable ride
          </h2>
        </Reveal>

        <div className="relative mt-16">
          <div
            className="absolute left-[16.667%] right-[16.667%] top-8 hidden h-px bg-gradient-to-r from-slate-200 via-brand-300 to-slate-200 md:block"
            aria-hidden="true"
          />
          <ol className="relative grid gap-12 md:grid-cols-3 md:gap-8">
            {STEPS.map((step, i) => (
              <Reveal as="li" key={step.step} delay={i * 120} className="flex flex-col items-center text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-500 text-xl font-black text-white shadow-lg shadow-brand-500/25 ring-8 ring-white">
                  {step.step}
                </span>
                <h3 className="mt-6 text-lg font-bold text-slate-900">{step.title}</h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-600">{step.description}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
