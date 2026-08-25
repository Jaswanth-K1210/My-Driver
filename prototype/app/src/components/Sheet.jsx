import { X } from 'lucide-react'
import { cn } from '../lib/utils.js'

export default function Sheet({ open, onClose, title, children }) {
  if (!open) return null

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <button type="button" aria-label="Close sheet" onClick={onClose} className="absolute inset-0 bg-white/85 backdrop-blur-sm" />
      <div className="rise-in relative max-h-[75%] overflow-y-auto rounded-t-3xl border-t border-slate-200 bg-white p-5 no-scrollbar">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 p-1.5 text-slate-500 transition-colors hover:text-slate-900"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Segmented({ options, value, onChange, className }) {
  return (
    <div className={cn('flex rounded-xl bg-slate-100 p-1', className)} role="tablist">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          onClick={() => onChange(opt.id)}
          className={cn(
            'flex-1 rounded-lg px-2 py-2 text-xs font-bold transition-colors',
            value === opt.id ? 'bg-brand-500 text-white' : 'text-slate-500 hover:text-slate-900',
          )}
        >
          {opt.label ?? opt.name}
        </button>
      ))}
    </div>
  )
}
