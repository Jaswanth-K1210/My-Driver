import { Quote } from 'lucide-react'
import Reveal from './Reveal.jsx'
import { TESTIMONIALS } from '../../data/mock.js'

export default function Testimonials() {
  return (
    <section className="bg-slate-50 py-20 sm:py-28" aria-label="Customer testimonials">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="max-w-2xl text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Families and fleets ride with proof.
          </h2>
        </Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <Reveal as="figure" key={t.name} delay={i * 110} className="flex flex-col rounded-3xl border border-slate-200 bg-white p-8">
              <Quote className="h-7 w-7 text-brand-500" aria-hidden="true" />
              <blockquote className="mt-5 flex-1 text-sm leading-relaxed text-slate-700">“{t.quote}”</blockquote>
              <figcaption className="mt-7 border-t border-slate-200 pt-5">
                <p className="font-bold text-slate-900">{t.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{t.role}</p>
              </figcaption>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
