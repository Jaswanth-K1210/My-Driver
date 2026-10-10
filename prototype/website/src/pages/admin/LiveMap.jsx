import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Car, MapPin, X } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { api } from '../../lib/apiClient.js'
import { useAdminPoll } from '../../components/admin/useAdminPoll.js'
import { LevelBadge, StatusPill } from '../../components/admin/Indicators.jsx'
import { SectionCard } from '../../components/app/Primitives.jsx'
import DriverActivity from '../../components/admin/DriverActivity.jsx'
import { dateTime, formatPhone, humanize, rupees, tripRef } from '../../components/admin/format.js'
import { ApiError } from '../../lib/apiClient.js'

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
  const { data, error } = useAdminPoll(() => api.admin.liveDrivers(), 4000)
  const el = useRef(null)
  const map = useRef(null)
  const layer = useRef(null)
  const fitted = useRef(false)
  const [selected, setSelected] = useState(null)

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
      if (typeof d.lat !== 'number' || typeof d.lng !== 'number' || isNaN(d.lat) || isNaN(d.lng)) continue
      const marker = L.circleMarker([d.lat, d.lng], {
        radius: d.driver_id === selected ? 12 : 8,
        color: d.driver_id === selected ? '#0f172a' : '#fff',
        weight: d.driver_id === selected ? 3 : 2,
        fillColor: colourFor(d),
        fillOpacity: 1,
      })
      marker.bindTooltip(
        `<b>${escape(d.name ?? 'Driver')}</b><br>${d.vehicle_plate ? `${escape(d.vehicle_plate)} · ` : ''}${d.availability}` +
          (d.night_shield_certified ? ' · Night Shield' : '') +
          (d.escalation_level ? `<br>Escalation ${d.escalation_level}` : ''),
      )
      marker.on('click', () => setSelected(d.driver_id))
      marker.addTo(layer.current)
    }
    if (!fitted.current && drivers.length > 0) {
      map.current.fitBounds(drivers.map((d) => [d.lat, d.lng]), { padding: [40, 40], maxZoom: 14 })
      fitted.current = true
    }
  }, [data, selected])

  const drivers = data ?? []
  const onTrip = drivers.filter((d) => d.availability === 'ON_TRIP').length
  const flagged = drivers.filter((d) => d.escalation_level)
  const picked = drivers.find((d) => d.driver_id === selected)

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

      {selected ? (
        <Selection key={selected} driverId={selected} tripId={picked?.trip_id ?? null} onClose={() => setSelected(null)} />
      ) : (
        <p className="text-sm text-slate-500">Click a driver on the map to see their trip and record.</p>
      )}

      {flagged.length > 0 && (
        <ul className="space-y-2">
          {flagged.map((d) => (
            <li key={d.driver_id}>
              <button
                type="button"
                onClick={() => setSelected(d.driver_id)}
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

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-900">{children}</dd>
    </div>
  )
}

/**
 * What the desk needs after clicking a marker: the live trip (if any) and the
 * driver's earnings and safety record. Refetches when the driver's trip changes.
 */
function Selection({ driverId, tripId, onClose }) {
  const [driver, setDriver] = useState(null)
  const [trip, setTrip] = useState(null)
  const [error, setError] = useState(null)
  const top = useRef(null)

  useEffect(() => {
    if (driver) top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [driver])

  useEffect(() => {
    let cancelled = false
    Promise.all([api.admin.driver(driverId), tripId ? api.admin.trip(tripId) : null])
      .then(([d, t]) => {
        if (cancelled) return
        setDriver(d)
        setTrip(t)
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Could not load this driver'))
    return () => {
      cancelled = true
    }
  }, [driverId, tripId])

  if (error) return <p className="text-sm font-semibold text-red-600">{error}</p>
  if (!driver) return <p className="py-6 text-center text-sm text-slate-500">Loading driver…</p>

  const p = driver.profile
  const t = trip?.trip
  return (
    <div ref={top} className="scroll-mt-4 space-y-4">
      {t && (
        <SectionCard
          title={`Live trip · ${tripRef(t.id)}`}
          icon={MapPin}
          action={
            <div className="flex items-center gap-2">
              {trip.escalations.filter((e) => e.status !== 'RESOLVED').map((e) => <LevelBadge key={e.id} level={e.level} />)}
              <StatusPill status={t.status} />
            </div>
          }
        >
          <div className="grid gap-x-8 md:grid-cols-2">
            <dl className="divide-y divide-slate-100">
              <Row label="Customer">
                <Link to={`/customers/${t.customer_id}`} className="hover:text-brand-700">{t.customer_name ?? 'Unnamed'}</Link>
                <span className="block font-mono text-xs font-normal text-slate-500">{formatPhone(t.customer_phone) || '—'}</span>
              </Row>
              <Row label="Pickup">{t.pickup_address ?? '—'}</Row>
              <Row label="Drop">{t.drop_address ?? 'Hourly hire'}</Row>
              <Row label="Type">{humanize(t.requirement ?? t.booking_type)} · {t.required_certification}</Row>
            </dl>
            <dl className="divide-y divide-slate-100">
              <Row label="Started">{dateTime(t.started_at ?? t.matched_at)}</Row>
              <Row label="Speed limit">{t.speed_ceiling_kmh} km/h</Row>
              <Row label="Quoted fare">{rupees(t.estimated_fare)}</Row>
              <Row label="Payment">{trip.payment ? <StatusPill status={trip.payment.status} /> : 'None'}</Row>
            </dl>
          </div>
          <Link to={`/trips/${t.id}`} className="mt-3 inline-block text-xs font-bold text-brand-600 hover:text-brand-700">Open full trip →</Link>
        </SectionCard>
      )}

      <SectionCard
        title={p.full_name ?? 'Unnamed driver'}
        icon={Car}
        action={
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Close driver details">
            <X className="h-4 w-4" />
          </button>
        }
      >
        <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono text-sm text-slate-600">{formatPhone(p.phone_number) || '—'}</span>
          <StatusPill status={p.availability} />
          <span className="rounded-lg bg-slate-100 px-2 py-1 font-bold tabular-nums text-slate-600">score {Math.round(p.mydriver_score)}</span>
          {p.rating != null && <span className="rounded-lg bg-slate-100 px-2 py-1 font-bold tabular-nums text-slate-600">★ {p.rating.toFixed(2)} ({p.rating_count})</span>}
          {p.night_shield_certified && <span className="rounded-lg bg-slate-900 px-2 py-1 font-bold text-white">Night Shield</span>}
          <span className="text-slate-500">{(p.certifications ?? []).join(' · ')}</span>
        </div>
        <DriverActivity activity={driver.activity} />
        <Link to={`/drivers/${driverId}`} className="mt-4 inline-block text-xs font-bold text-brand-600 hover:text-brand-700">Open driver profile →</Link>
      </SectionCard>
    </div>
  )
}

/** Tooltip HTML is raw; names come from user input. */
function escape(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
