import Reveal from './Reveal.jsx'

/** The one section title used across the public site: label, title, intro, centred. */
export default function SectionHeading({ eyebrow, title, children }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-brand-600">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{title}</h2>
      {children && <p className="mt-4 text-lg text-slate-600">{children}</p>}
    </Reveal>
  )
}
