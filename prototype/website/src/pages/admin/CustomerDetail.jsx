import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Car, Fingerprint, Route, Users } from 'lucide-react'
import { api, ApiError } from '../../lib/apiClient.js'
import { SectionCard, StatCard } from '../../components/app/Primitives.jsx'
import { Empty, StatusPill } from '../../components/admin/Indicators.jsx'
import { dateTime, formatPhone, humanize, rupees, shortDate, tripRef } from '../../components/admin/format.js'

export default function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    setData(null)
    api.admin.customer(id).then(setData).catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this customer'))
  }, [id])

  if (error) return <Empty icon={Users} title="Customer not available" hint={error} />
  if (!data) return <p className="py-12 text-center text-sm text-slate-500">Loading customer…</p>

  const { customer, stats, kyc, guardians, vehicles, recent_trips: trips } = data
  const verified = kyc.length === 2 && kyc.every((k) => k.status === 'VERIFIED')

  return (
    <div className="space-y-6">
      <Link to="/customers" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Customers
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">{customer.full_name ?? 'Unnamed customer'}</h1>
          <p className="mt-1 font-mono text-sm text-slate-500">
            {formatPhone(customer.phone_number) || '—'}{customer.email ? ` · ${customer.email}` : ''}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Customer since {shortDate(customer.created_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {customer.is_demo && <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">Demo account</span>}
          {verified && <span className="rounded-lg bg-slate-900 px-2 py-1 text-xs font-bold text-white">ID verified</span>}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Trips" value={stats.trips} />
        <StatCard label="Completed" value={stats.completed} />
        <StatCard label="Cancelled" value={stats.cancelled} />
        <StatCard label="Spent" value={rupees(stats.spent - stats.refunded)} />
        <StatCard label="Incidents" value={stats.incidents} danger={stats.incidents > 0} />
      </div>
      {stats.owed > 0 && (
        <p className="rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800">
          Owes {rupees(stats.owed)} from trips that ran over their payment hold.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <SectionCard
          title="Recent trips"
          icon={Route}
          action={<Link to={`/trips?customer_id=${customer.id}`} className="text-xs font-bold text-brand-600 hover:text-brand-700">All trips →</Link>}
        >
          {trips.length === 0 ? (
            <p className="text-sm text-slate-500">No trips yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {trips.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => navigate(`/trips/${t.id}`)} className="flex w-full flex-wrap items-center gap-3 py-3 text-left hover:bg-slate-50">
                    <span className="font-mono text-xs font-bold text-slate-900">{tripRef(t.id)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{t.pickup_address ?? 'Pickup'} → {t.drop_address ?? 'Drop'}</span>
                    <span className="text-xs text-slate-500">{dateTime(t.requested_at)}</span>
                    <span className="w-20 text-right text-sm font-semibold tabular-nums text-slate-900">{rupees(t.fare_amount ?? t.estimated_fare)}</span>
                    <StatusPill status={t.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Identity" icon={Fingerprint}>
            {kyc.length === 0 ? (
              <p className="text-sm text-slate-500">Not verified (optional for customers).</p>
            ) : (
              <ul className="space-y-2">
                {kyc.map((k) => (
                  <li key={k.kind} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{k.kind === 'PAN' ? 'PAN' : 'Aadhaar'} ending {k.number_last4}</span>
                    <StatusPill status={k.status} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={`Guardians · ${guardians.length}`} icon={Users}>
            {guardians.length === 0 ? (
              <p className="text-sm text-slate-500">No guardians saved.</p>
            ) : (
              <ul className="space-y-2">
                {guardians.map((g, i) => (
                  <li key={i} className="text-sm">
                    <p className="font-semibold text-slate-900">{g.name} <span className="font-normal text-slate-500">· {g.relation ?? 'Guardian'}</span></p>
                    <p className="font-mono text-xs text-slate-500">{formatPhone(g.phone)}</p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title={`Garage · ${vehicles.length}`} icon={Car}>
            {vehicles.length === 0 ? (
              <p className="text-sm text-slate-500">No saved cars.</p>
            ) : (
              <ul className="space-y-2">
                {vehicles.map((v, i) => (
                  <li key={i} className="text-sm">
                    <p className="font-semibold text-slate-900">
                      {v.company} {v.model}
                      {v.is_default && <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">Default</span>}
                    </p>
                    <p className="text-xs text-slate-500">{[v.transmission, humanize(v.engine_type), v.plate].filter(Boolean).join(' · ')}</p>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  )
}
