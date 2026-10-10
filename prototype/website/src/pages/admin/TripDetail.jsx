import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Camera, Clock, CreditCard, MapPin, ShieldAlert, Star, Users } from 'lucide-react'
import { api, ApiError } from '../../lib/apiClient.js'
import { SectionCard } from '../../components/app/Primitives.jsx'
import { Empty, LevelBadge, StatusPill } from '../../components/admin/Indicators.jsx'
import { dateTime, formatPhone, humanize, reasonLabel, rupees, tripRef } from '../../components/admin/format.js'

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-900">{children}</dd>
    </div>
  )
}

function Person({ title, name, phone, to, extra }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</p>
      {name || phone ? (
        <>
          {to ? (
            <Link to={to} className="mt-1 block truncate text-base font-bold text-slate-900 hover:text-brand-700">{name ?? 'Unnamed'}</Link>
          ) : (
            <p className="mt-1 truncate text-base font-bold text-slate-900">{name ?? 'Unnamed'}</p>
          )}
          <p className="font-mono text-xs text-slate-500">{formatPhone(phone) || '—'}</p>
          {extra && <p className="mt-1 text-xs text-slate-500">{extra}</p>}
        </>
      ) : (
        <p className="mt-1 text-sm text-slate-500">Not assigned</p>
      )}
    </div>
  )
}

export default function TripDetail() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setData(null)
    api.admin.trip(id).then(setData).catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this trip'))
  }, [id])

  if (error) return <Empty icon={MapPin} title="Trip not available" hint={error} />
  if (!data) return <p className="py-12 text-center text-sm text-slate-500">Loading trip…</p>

  const { trip, events, payment, escalations, rating, inspections, guardian, checkin } = data

  return (
    <div className="space-y-6">
      <Link to="/trips" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Trips
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl font-black tracking-tight text-slate-900">{tripRef(trip.id)}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Requested {dateTime(trip.requested_at)} · {humanize(trip.requirement ?? trip.booking_type)} · {trip.required_certification}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {escalations.map((e) => <LevelBadge key={e.id} level={e.level} />)}
          <StatusPill status={trip.status} />
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <Person title="Customer" name={trip.customer_name} phone={trip.customer_phone} to={`/customers/${trip.customer_id}`} extra={trip.customer_email} />
        <Person
          title="Driver"
          name={trip.driver_name}
          phone={trip.driver_phone}
          to={trip.driver_id ? `/drivers/${trip.driver_id}` : null}
          extra={trip.vehicle_model ? `${trip.vehicle_model} · ${trip.vehicle_plate ?? ''}${trip.driver_rating ? ` · ★ ${trip.driver_rating.toFixed(1)}` : ''}` : null}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <SectionCard title="Route" icon={MapPin}>
            <dl className="divide-y divide-slate-100">
              <Row label="Pickup">{trip.pickup_address ?? `${trip.pickup_lat.toFixed(4)}, ${trip.pickup_lng.toFixed(4)}`}</Row>
              {(trip.stops ?? []).length > 0 && <Row label="Stops">{trip.stops.length}</Row>}
              <Row label="Drop">{trip.drop_address ?? (trip.drop_lat ? `${trip.drop_lat.toFixed(4)}, ${trip.drop_lng.toFixed(4)}` : 'Hourly hire')}</Row>
              <Row label="Distance">{trip.distance_km != null ? `${trip.distance_km} km` : `~${trip.estimated_distance_km ?? '—'} km (estimate)`}</Row>
              <Row label="Duration">{trip.duration_min != null ? `${trip.duration_min} min` : '—'}</Row>
              <Row label="Speed limit">{trip.speed_ceiling_kmh} km/h</Row>
              {trip.flight_number && <Row label="Flight">{trip.flight_number}</Row>}
              {trip.cancellation_reason && <Row label="Cancelled because">{trip.cancellation_reason}</Row>}
            </dl>
          </SectionCard>

          <SectionCard title="Timeline" icon={Clock}>
            {events.length === 0 ? (
              <p className="text-sm text-slate-500">No events recorded.</p>
            ) : (
              <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                {events.map((e, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-300 ring-4 ring-white" aria-hidden="true" />
                    <p className="text-sm font-semibold text-slate-900">{humanize(e.type)}</p>
                    <p className="text-xs text-slate-500">
                      {dateTime(e.created_at)}
                      {e.actor_name ? ` · ${e.actor_name}` : e.actor_role ? ` · ${humanize(e.actor_role)}` : ' · System'}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>

          {escalations.length > 0 && (
            <SectionCard title="Incidents" icon={ShieldAlert}>
              <ul className="space-y-2">
                {escalations.map((e) => (
                  <li key={e.id}>
                    <Link to={`/incident/${e.id}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 p-3 hover:bg-slate-50">
                      <LevelBadge level={e.level} />
                      <span className="flex-1 text-sm font-semibold text-slate-900">{reasonLabel(e.reason)}</span>
                      <StatusPill status={e.status} />
                      <span className="text-xs text-slate-500">{dateTime(e.opened_at)}</span>
                    </Link>
                    {e.resolution && <p className="mt-1 px-3 text-xs text-slate-500">Resolution: {e.resolution}</p>}
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>

        <div className="space-y-6">
          <SectionCard title="Fare and payment" icon={CreditCard}>
            <dl className="divide-y divide-slate-100">
              <Row label="Quoted">{rupees(trip.estimated_fare)}</Row>
              <Row label="Final fare">{rupees(trip.fare_amount)}</Row>
              {trip.platform_fee != null && <Row label="Platform fee">{rupees(trip.platform_fee)}</Row>}
              {trip.night_fee > 0 && <Row label="Night fee">{rupees(trip.night_fee)}</Row>}
              {trip.driver_earnings != null && <Row label="Driver earns">{rupees(trip.driver_earnings)}</Row>}
            </dl>
            {payment ? (
              <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Payment</span>
                  <StatusPill status={payment.status} />
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  Held {rupees(payment.amount_authorized)} · captured {rupees(payment.amount_captured)}
                  {payment.amount_refunded > 0 && <> · refunded {rupees(payment.amount_refunded)}</>}
                </p>
                {payment.amount_due > 0 && <p className="text-xs font-semibold text-brand-700">Customer owes {rupees(payment.amount_due)}</p>}
                <p className="mt-1 truncate font-mono text-[11px] text-slate-500">{payment.provider_payment_id ?? payment.provider_order_id}</p>
                <Link to="/payments" className="mt-2 inline-block text-xs font-bold text-brand-600 hover:text-brand-700">Open in Payments →</Link>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No payment on this trip.</p>
            )}
          </SectionCard>

          <SectionCard title="Rating" icon={Star}>
            {rating ? (
              <>
                <p className="text-lg font-black text-slate-900">{'★'.repeat(rating.rating)}<span className="text-slate-300">{'★'.repeat(5 - rating.rating)}</span></p>
                {rating.comment && <p className="mt-1 text-sm text-slate-600">“{rating.comment}”</p>}
              </>
            ) : (
              <p className="text-sm text-slate-500">Not rated.</p>
            )}
          </SectionCard>

          <SectionCard title="Safety record" icon={Users}>
            <dl className="divide-y divide-slate-100">
              <Row label="Guardian links">{guardian?.links ? `${guardian.links} · ${guardian.views} views` : 'None shared'}</Row>
              <Row label="Inspections">
                {inspections.length
                  ? inspections.map((i) => `${humanize(i.phase)} ${i.photos}/8`).join(' · ')
                  : 'None'}
              </Row>
              {checkin && <Row label="Night check-in">{humanize(checkin.outcome)}{checkin.called_at ? ` · ${dateTime(checkin.called_at)}` : ''}</Row>}
            </dl>
            {inspections.length > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Camera className="h-3.5 w-3.5" aria-hidden="true" /> Photos are sealed in the Trip Vault.</p>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
