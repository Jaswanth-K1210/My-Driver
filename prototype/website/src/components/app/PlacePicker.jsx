import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Loader2, LocateFixed, Map as MapIcon, MapPin, PlusCircle, Search } from 'lucide-react'
import { api } from '../../lib/apiClient.js'
import { getLocationById, registerPlace } from '../../lib/booking.js'
import { cn } from '../../lib/utils.js'
import MapPickerModal from './MapPickerModal.jsx'
import { useAuth } from '../../context/authStore.js'

/** Parse "18.6429, 78.9165" style coordinate input if entered directly. */
function parseLatLngQuery(q) {
  const m = String(q)
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null
  }
  return { lat, lng }
}

/**
 * Names the customer's GPS position through the backend's locations proxy.
 * Never call a geocoder from the browser: that would send the customer's
 * position to a third party (CR-3). Signed out, or if the lookup fails, the
 * coordinates themselves are the label.
 */
async function reverseGeocode(lat, lng, signedIn) {
  if (signedIn) {
    try {
      const place = await api.locations.reverse({ lat, lng })
      return { name: `Current Location (${place.name})`, address: place.address }
    } catch {
      // Fall through to the coordinates.
    }
  }
  return {
    name: `Current Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
    address: `GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
  }
}

// Cache the customer's detected GPS place across re-renders so we only prompt once automatically.
let cachedCustomerGpsPlace = null
let autoDetectAttempted = false

/**
 * Location field for the booking form. Closed, it shows the chosen place.
 * Open, it lists the suggested places, and typing two or more characters
 * searches the backend's cached place proxy, plus allows selecting the
 * customer's live GPS location or typed-in coordinates.
 */
export default function PlacePicker({
  value,
  onChange,
  options = [],
  placeholder = 'Choose a place',
  near,
  label,
  tone = 'default',
  showCurrentLocation = false,
  autoDetectCurrentLocation = false,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState(null)
  const [active, setActive] = useState(0)
  const [mapOpen, setMapOpen] = useState(false)
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const listId = useId()
  const { isAuthenticated } = useAuth()

  const selected = getLocationById(value) ?? options.find((o) => o.id === value)
  const trimmed = query.trim()
  const searching = trimmed.length >= 2

  const handleUseCurrentLocation = useCallback(
    async ({ silent = false } = {}) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        if (!silent) {
          setError('Location access is not supported by this browser.')
          setOpen(true)
        }
        return
      }
      setLocating(true)
      setError(null)
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const lat = pos.coords.latitude
            const lng = pos.coords.longitude
            const geo = await reverseGeocode(lat, lng, isAuthenticated)
            const place = {
              id: `gps_${lat.toFixed(5)}_${lng.toFixed(5)}`,
              name: geo.name,
              address: geo.address,
              lat,
              lng,
            }
            cachedCustomerGpsPlace = place
            const id = registerPlace(place)
            onChange(id)
            setOpen(false)
            setQuery('')
          } finally {
            setLocating(false)
          }
        },
        (err) => {
          setLocating(false)
          if (!silent) {
            setError(
              err?.code === 1
                ? 'Location permission was denied. Allow location access in your browser address bar, or search/enter your address below.'
                : 'Could not read your GPS position. You can type any custom location or coordinates below.',
            )
            setOpen(true)
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      )
    },
    [onChange, isAuthenticated],
  )

  // Automatically use customer's current GPS location once on initial mount when enabled
  // Once per mount: re-running on `value` would undo a deliberate pick of the default preset.
  const autoAppliedRef = useRef(false)
  useEffect(() => {
    if (!autoDetectCurrentLocation || autoAppliedRef.current) return
    autoAppliedRef.current = true
    if (cachedCustomerGpsPlace) {
      if (value === 'start_hitec') {
        onChange(registerPlace(cachedCustomerGpsPlace))
      }
      return
    }
    if (autoDetectAttempted) return
    autoDetectAttempted = true
    if (value === 'start_hitec') {
      void handleUseCurrentLocation({ silent: true })
    }
  }, [autoDetectCurrentLocation, handleUseCurrentLocation, onChange, value])

  // Debounced search: local preset matches plus the backend's place search.
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
        const lower = trimmed.toLowerCase()
        const localMatches = options.filter(
          (o) =>
            o.name?.toLowerCase().includes(lower) ||
            o.address?.toLowerCase().includes(lower),
        )

        const backendFound = isAuthenticated
          ? await api.locations
              .search(trimmed, near)
              .then((r) => r?.results ?? [])
              .catch(() => [])
          : []

        if (!cancelled) {
          const seen = new Set()
          const merged = []
          for (const item of [...localMatches, ...backendFound]) {
            if (!item || seen.has(item.id)) continue
            seen.add(item.id)
            merged.push(item)
          }
          setResults(merged)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, searching, isAuthenticated, near?.lat, near?.lng])

  useEffect(() => {
    if (!open) return undefined
    setTimeout(() => inputRef.current?.focus(), 0)
    const onDown = (e) => !rootRef.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Typed coordinates are the only free-text entry: a typed name has no
  // coordinates of its own, and booking it at the pickup point collapses the fare.
  const parsedCoords = parseLatLngQuery(trimmed)
  const customPlaceOption = searching && parsedCoords
    ? {
        id: `custom_coords_${parsedCoords.lat}_${parsedCoords.lng}`,
        name: `GPS Coordinates (${parsedCoords.lat.toFixed(4)}, ${parsedCoords.lng.toFixed(4)})`,
        address: `${parsedCoords.lat}, ${parsedCoords.lng}`,
        lat: parsedCoords.lat,
        lng: parsedCoords.lng,
        isCustom: true,
      }
    : null

  const baseItems = searching ? (results ?? []) : options
  const items =
    customPlaceOption && !baseItems.some((p) => p.name?.toLowerCase() === trimmed.toLowerCase())
      ? [...baseItems, customPlaceOption]
      : baseItems

  const choose = (place) => {
    const isPreset = options.some((o) => o.id === place.id)
    onChange(isPreset ? place.id : registerPlace(place))
    setOpen(false)
    setQuery('')
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault()
      choose(items[active])
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', open && 'z-50')}>
      <div className="relative flex items-center">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={label}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            'flex h-10 w-full items-center gap-2 rounded-xl border bg-white pl-3 text-left text-sm font-semibold focus:outline-none',
            showCurrentLocation ? 'pr-16' : 'pr-8',
            tone === 'brand'
              ? 'border-brand-300 text-brand-950 focus:border-brand-500'
              : 'border-slate-200 text-slate-900 focus:border-brand-400',
          )}
        >
          <span className={cn('min-w-0 flex-1 truncate', !selected && 'font-medium text-slate-400')}>
            {selected ? selected.name : placeholder}
          </span>
        </button>

        {showCurrentLocation && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              void handleUseCurrentLocation({ silent: false })
            }}
            disabled={locating}
            title="Use my current location"
            aria-label="Use my current location"
            className="absolute right-8 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg text-brand-600 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50 transition-colors"
          >
            {locating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <LocateFixed className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        )}

        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-11 z-50 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/15">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search any place, address, or lat,lng"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:outline-none"
            />
            {loading && (
              <Loader2
                className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400"
                aria-hidden="true"
              />
            )}
          </div>

          {showCurrentLocation && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void handleUseCurrentLocation({ silent: false })}
              disabled={locating}
              className="mt-2 flex w-full items-center gap-2.5 rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-2 text-left text-xs font-bold text-brand-700 hover:bg-brand-50 transition-colors"
            >
              {locating ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand-600" aria-hidden="true" />
              ) : (
                <LocateFixed className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
              )}
              <span className="truncate">
                {locating ? 'Detecting your GPS location…' : 'Use my current location'}
              </span>
            </button>
          )}

          {isAuthenticated && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false)
                setMapOpen(true)
              }}
              className="mt-2 flex w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <MapIcon className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
              <span className="truncate">Choose on map</span>
            </button>
          )}

          <p className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            {searching ? 'Search results' : 'Suggested'}
          </p>
          <ul id={listId} role="listbox" className="max-h-64 overflow-y-auto">
            {error && <li className="px-3 py-2.5 text-xs font-medium text-brand-600">{error}</li>}
            {searching && !loading && results && items.length === 0 && (
              <li className="px-3 py-2.5 text-xs text-slate-500">No places found. Try another name or paste lat,lng.</li>
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
                {place.isCustom ? (
                  <PlusCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                ) : (
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">
                    {place.isCustom ? `Use custom location: "${place.name}"` : place.name}
                  </span>
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

      <MapPickerModal
        open={mapOpen}
        title={label ? `${label}: choose on map` : 'Choose on map'}
        start={selected ?? near}
        onClose={() => setMapOpen(false)}
        onPick={(place) => {
          onChange(registerPlace(place))
          setMapOpen(false)
        }}
      />
    </div>
  )
}
