import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Loader2, MapPin, X } from 'lucide-react'
import { api } from '../../lib/apiClient.js'

const TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const HYDERABAD = { lat: 17.44, lng: 78.39 }

const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:9999px;background:#e01e26;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
})

/**
 * Pick a point on the map: tap to drop the pin, drag to fine-tune, confirm.
 * The pin keeps its exact coordinates; the backend only names it.
 */
export default function MapPickerModal({ open, start, title = 'Choose on map', onClose, onPick }) {
  const el = useRef(null)
  const map = useRef(null)
  const marker = useRef(null)
  const [point, setPoint] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // Read once per opening: a new object each parent render must not rebuild the map.
  const startRef = useRef(start)
  startRef.current = start

  useEffect(() => {
    if (!open) return undefined
    const start = startRef.current
    const center = start && Number.isFinite(start.lat) ? start : HYDERABAD
    map.current = L.map(el.current, { zoomControl: true }).setView([center.lat, center.lng], start ? 16 : 12)
    L.tileLayer(TILES, { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map.current)

    const place = (latlng) => {
      if (!marker.current) {
        marker.current = L.marker(latlng, { icon: pinIcon, draggable: true }).addTo(map.current)
        marker.current.on('dragend', () => setPoint(marker.current.getLatLng()))
      } else {
        marker.current.setLatLng(latlng)
      }
      setPoint(latlng)
    }
    if (start && Number.isFinite(start.lat)) place(L.latLng(start.lat, start.lng))
    map.current.on('click', (e) => place(e.latlng))
    // The dialog animates in; measure the map once it has its real size.
    setTimeout(() => map.current?.invalidateSize(), 50)

    return () => {
      map.current?.remove()
      map.current = null
      marker.current = null
      setPoint(null)
      setError(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const confirm = async () => {
    if (!point) return
    setBusy(true)
    setError(null)
    try {
      onPick(await api.locations.reverse({ lat: point.lat, lng: point.lng }))
    } catch (err) {
      setError(err?.message ?? 'Could not look up that point. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-[70vh] sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500">Tap the map to drop the pin, then drag it to the exact spot.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div ref={el} className="min-h-0 flex-1" />
        <div className="flex flex-col gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin className="h-4 w-4 text-brand-600" aria-hidden="true" />
            {point ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : 'No point chosen yet'}
          </p>
          {error && <p className="text-xs font-medium text-brand-600">{error}</p>}
          <button
            type="button"
            onClick={confirm}
            disabled={!point || busy}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Use this point
          </button>
        </div>
      </div>
    </div>
  )
}
