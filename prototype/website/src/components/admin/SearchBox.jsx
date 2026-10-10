import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '../../lib/utils.js'

/** The value, settled: updates `ms` after the last change. */
export function useDebounced(value, ms) {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

/** The console's one search field, so every list searches the same way. */
export function SearchBox({ value, onChange, placeholder, className, autoFocus }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-700">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
