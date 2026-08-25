import { cn } from '../../lib/utils.js'

/** Labelled input with optional leading icon, trailing slot and error text. */
export function Field({ id, label, icon: Icon, error, trailing, className, ...rest }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
        )}
        <input
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            'w-full rounded-2xl border bg-slate-50 py-3.5 text-sm font-medium text-slate-900 transition-colors placeholder:text-slate-400 focus:bg-white focus:outline-none',
            Icon ? 'pl-11' : 'pl-4',
            trailing ? 'pr-12' : 'pr-4',
            error ? 'border-brand-400 focus:border-brand-500' : 'border-slate-200 focus:border-brand-400',
            className,
          )}
          {...rest}
        />
        {trailing && <span className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</span>}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-semibold text-brand-600">
          {error}
        </p>
      )}
    </div>
  )
}

export default Field
