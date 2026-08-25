import Reveal from './Reveal.jsx'
import { SKILLS } from '../../data/mock.js'

export default function Skills() {
  return (
    <section id="skills" className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-600">Skill certifications</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
            Five certifications. One standard of integrity.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Every driver earns their MD badge through police checks, licence validation and a supervised driving
            assessment — renewed every six months.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {SKILLS.map((skill, i) => (
            <Reveal
              as="article"
              key={skill.id}
              delay={i * 80}
              className="group flex min-h-[240px] flex-col rounded-3xl border border-slate-200 bg-white p-6 transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-xl hover:shadow-slate-900/5"
            >
              <span className="w-fit rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] font-bold tracking-wide text-slate-600 ring-1 ring-slate-200 transition-colors group-hover:bg-brand-50 group-hover:text-brand-700 group-hover:ring-brand-200">
                {skill.id}
              </span>
              <h3 className="mt-4 text-lg font-bold text-slate-900">{skill.label}</h3>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{skill.tagline}</p>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-600">{skill.description}</p>
              <p className="mt-5 border-t border-slate-200 pt-4 text-sm font-black text-brand-600">₹{skill.rate}/km</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
