import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../../lib/apiClient.js'
import { useAdminPoll } from '../../components/admin/useAdminPoll.js'
import { LevelBadge } from '../../components/admin/Indicators.jsx'

// Hyderabad, where the pilot runs. The map re-fits to drivers on first data.
const START = [17.44, 78.39]

/** One colour per state; an open escalation overrides availability. */
function colourFor(d) {
  if (d.escalation_level && d.escalation_level >= 'L3') return '#dc2626'
  if (d.escalation_level) return '#f59e0b'
  if (d.availability === 'ON_TRIP') return '#2563eb'
  return '#16a34a'
}

const LEGEND = [
  ['#16a34a', 'Online, free'],
  ['#2563eb', 'On a trip'],
  ['#f59e0b', 'Escalation L0–L2'],
  ['#dc2626', 'Escalation L3+'],
]

/**
 * Every online driver on a real map, refreshed every 4s.
 *
 * Polls rather than streams for the same reason the live board does: the
 * WebSocket gateway only serves the two parties on a trip.
 */
export default function LiveMap() {
  const navigate = useNavigate()
  const { data, error } = useAdminPoll(() => api.admin.liveDrivers(), 4000)
  const el = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const fitted = useRef(false)

  useEffect(() => {
    map.current = L.map(el.current).setView(START, 12)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => map.current.remove()
  }, [])

  useEffect(() => {
    const drivers = data ?? []
    if (!layer.current) return
    layer.current.clearLayers()
    for (const d of drivers) {
      const marker = L.circleMarker([d.lat, d.lng], {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: colourFor(d),
        fillOpacity: 1,
      })
      marker.bindTooltip(
        `<b>${escape(d.name ?? 'Driver')}</b><br>${escape(d.vehicle_plate ?? 'no plate')} · ${d.availability}` +
          (d.night_shield_certified ? ' · Night Shield' : '') +
          (d.escalation_level ? `<br>Escalation ${d.escalation_level}` : ''),
      )
      marker.on('click', () => navigate(`/drivers/${d.driver_id}`))
      marker.addTo(layer.current)
    }
    if (!fitted.current && drivers.length > 0) {
      map.current.fitBounds(drivers.map((d) => [d.lat, d.lng]), { padding: [40, 40], maxZoom: 14 })
      fitted.current = true
    }
  }, [data, navigate])

  const drivers = data ?? []
  const onTrip = drivers.filter((d) => d.availability === 'ON_TRIP').length
  const flagged = drivers.filter((d) => d.escalation_level)

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Live map</h1>
          <p className="mt-1 text-sm text-slate-500">
            {drivers.length} drivers online · {onTrip} on a trip · {flagged.length} flagged
            {error && <span className="ml-2 font-semibold text-red-600">· feed interrupted</span>}
          </p>
        </div>
        <ul className="flex flex-wrap gap-3 text-xs text-slate-600">
          {LEGEND.map(([c, label]) => (
            <li key={label} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full" style={{ background: c }} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </header>

      <div
        ref={el}
        className="isolate h-[65vh] min-h-80 w-full overflow-hidden rounded-3xl border border-slate-200"
        role="region"
        aria-label="Map of online drivers"
      />

      {flagged.length > 0 && (
        <ul className="space-y-2">
          {flagged.map((d) => (
            <li key={d.driver_id}>
              <button
                type="button"
                onClick={() => navigate(`/drivers/${d.driver_id}`)}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left text-sm hover:bg-slate-50"
              >
                <LevelBadge level={d.escalation_level} />
                <span className="font-semibold text-slate-900">{d.name ?? 'Driver'}</span>
                <span className="text-slate-500">{d.vehicle_plate}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Tooltip HTML is raw; names come from user input. */
function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
