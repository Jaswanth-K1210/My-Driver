/** The one page title used on every signed-in customer page. */
export default function PageHeader({ eyebrow, title, subtitle, children }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-sm font-medium text-slate-500">{eyebrow}</p>}
        <h1 className="text-3xl font-black tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm text-slate-600">{subtitle}</p>}
      </div>
      {children}
    </header>
  )
}
