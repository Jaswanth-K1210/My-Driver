import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Loader2, MapPin, Search } from 'lucide-react'
import { api } from '../../lib/apiClient.js'
import { getLocationById, registerPlace } from '../../lib/booking.js'
import { cn } from '../../lib/utils.js'
import { useAuth } from '../../context/authStore.js'

/**
 * Location field for the booking form. Closed, it shows the chosen place.
 * Open, it lists the suggested places, and typing two or more characters
 * searches the backend's cached place proxy instead.
 *
 * Value and onChange are location ids, exactly like the <select> it replaces,
 * so the booking logic did not change: a searched place is registered with
 * registerPlace() and resolves through getLocationById().
 */
export default function PlacePicker({ value, onChange, options = [], placeholder = 'Choose a place', near, label, tone = 'default' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [active, setActive] = useState(0)
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const listId = useId()
  // Search is a paid upstream call, so the API only allows it signed in.
  const { isAuthenticated } = useAuth()

  const selected = getLocationById(value) ?? options.find((o) => o.id === value)
  const searching = query.trim().length >= 2 && isAuthenticated
  const needsLogin = query.trim().length >= 2 && !isAuthenticated
  const items = searching ? (results ?? []) : options

  // Debounced search: 300 ms after the last keystroke, and the latest
  // response wins even if an older one arrives later.
  useEffect(() => {
    if (!searching) {
      setResults(null)
      setError(null)
      return undefined
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const { results: found } = await api.locations.search(query.trim(), near)
        if (!cancelled) {
          setResults(found)
          setError(null)
          setActive(0)
        }
      } catch (err) {
        if (!cancelled) setError(err?.message ?? 'Search is unavailable right now')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // near is compared by its coordinates, not object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, searching, near?.lat, near?.lng])

  useEffect(() => {
    if (!open) return undefined
    setTimeout(() => inputRef.current?.focus(), 0)
    const onDown = (e) => !rootRef.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const choose = (place) => {
    // Search results are not in the built-in lists: register before selecting.
    onChange(searching ? registerPlace(place) : place.id)
    setOpen(false)
    setQuery('')
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter' && items[active]) { e.preventDefault(); choose(items[active]) }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-xl border bg-white pl-3 pr-8 text-left text-sm font-semibold focus:outline-none',
          tone === 'brand' ? 'border-brand-300 text-brand-950 focus:border-brand-500' : 'border-slate-200 text-slate-900 focus:border-brand-400',
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'font-medium text-slate-400')}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-11 z-30 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search a place, area or address"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:outline-none"
            />
            {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" aria-hidden="true" />}
          </div>

          <p className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            {searching ? 'Search results' : 'Suggested'}
          </p>
          <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto">
            {needsLogin && (
              <li className="px-3 py-3 text-sm text-slate-500">Log in to search any address. Suggested places are below.</li>
            )}
            {error && <li className="px-3 py-3 text-sm text-brand-600">{error}</li>}
            {!error && searching && results && results.length === 0 && (
              <li className="px-3 py-3 text-sm text-slate-500">No places found. Try a nearby landmark or area name.</li>
            )}
            {items.map((place, i) => (
              <li
                key={place.id}
                role="option"
                aria-selected={place.id === value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(place)}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5',
                  i === active ? 'bg-slate-50' : '',
                  place.id === value && 'bg-brand-50',
                )}
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">{place.name}</span>
                  {(place.address || place.distanceKm) && (
                    <span className="block truncate text-xs text-slate-500">
                      {place.address}
                      {place.distanceKm ? `${place.address ? ' · ' : ''}~${place.distanceKm} km` : ''}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
