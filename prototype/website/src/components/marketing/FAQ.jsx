import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import Reveal from './Reveal.jsx'
import { FAQS } from '../../data/mock.js'
import { cn } from '../../lib/utils.js'

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(0)

  return (
    <section id="faq" className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="text-center text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Questions, answered</h2>
        </Reveal>
        <Reveal delay={100} className="mt-12 divide-y divide-slate-200 overflow-hidden rounded-3xl border border-slate-200">
          {FAQS.map((faq, index) => {
            const open = openIndex === index
            return (
              <div key={faq.q} className={open ? 'bg-brand-50/40' : 'bg-white'}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-7 py-5 text-left transition-colors hover:bg-slate-50"
                  aria-expanded={open}
                  onClick={() => setOpenIndex(open ? -1 : index)}
                >
                  <span className="font-semibold text-slate-900">{faq.q}</span>
                  <ChevronDown
                    className={cn('h-5 w-5 shrink-0 transition-transform duration-200', open ? 'rotate-180 text-brand-500' : 'text-slate-400')}
                    aria-hidden="true"
                  />
                </button>
                {open && <p className="px-7 pb-6 text-sm leading-relaxed text-slate-600">{faq.a}</p>}
              </div>
            )
          })}
        </Reveal>
      </div>
    </section>
  )
}
