import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Route, X } from 'lucide-react'
import { api, ApiError } from '../../lib/apiClient.js'
import PageHeader from '../../components/admin/PageHeader.jsx'
import { SectionCard } from '../../components/app/Primitives.jsx'
import { Empty, LevelBadge, StatusPill } from '../../components/admin/Indicators.jsx'
import { SearchBox, useDebounced } from '../../components/admin/SearchBox.jsx'
import { dateTime, formatPhone, rupees, tripRef } from '../../components/admin/format.js'

const STATUSES = [
  ['', 'Any status'],
  ['COMPLETED', 'Completed'],
  ['IN_TRIP', 'In trip'],
  ['REQUESTED', 'Requested'],
  ['MATCHED', 'Matched'],
  ['CANCELLED', 'Cancelled'],
  ['NO_DRIVERS_FOUND', 'No drivers found'],
  ['ESCALATED', 'Escalated'],
]

const field = 'h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-slate-400 focus:outline-none'

export default function Trips() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const query = useDebounced(q.trim(), 300)
  const status = params.get('status') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  // Set when arriving from a customer or driver page: "this person's trips".
  const customerId = params.get('customer_id') ?? ''
  const driverId = params.get('driver_id') ?? ''

  const [items, setItems] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [error, setError] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const setParam = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const filters = { q: query || undefined, status: status || undefined, from: from || undefined, to: to || undefined, customer_id: customerId || undefined, driver_id: driverId || undefined, limit: 25 }

  useEffect(() => {
    let cancelled = false
    setItems(null)
    setError(null)
    api.admin
      .trips(filters)
      .then((r) => {
        if (cancelled) return
        setItems(r.items)
        setCursor(r.next_cursor)
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Could not load trips'))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, status, from, to, customerId, driverId])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const r = await api.admin.trips({ ...filters, cursor })
      setItems((prev) => [...prev, ...r.items])
      setCursor(r.next_cursor)
    } finally {
      setLoadingMore(false)
    }
  }

  const scoped = customerId || driverId

  return (
    <div className="space-y-6">
      <PageHeader title="Trips" subtitle="Find any trip by reference, customer, driver, phone number or address" />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchBox value={q} onChange={(v) => { setQ(v); setParam('q', v.trim()) }} placeholder="TRP-1A2B3C, name, phone or address" className="lg:flex-1" autoFocus />
        <select value={status} onChange={(e) => setParam('status', e.target.value)} className={field} aria-label="Status">
          {STATUSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          From <input type="date" value={from} onChange={(e) => setParam('from', e.target.value)} className={field} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          To <input type="date" value={to} onChange={(e) => setParam('to', e.target.value)} className={field} />
        </label>
      </div>

      {scoped && (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          Showing trips for one {customerId ? 'customer' : 'driver'}.
          <button type="button" onClick={() => { const next = new URLSearchParams(params); next.delete('customer_id'); next.delete('driver_id'); setParams(next, { replace: true }) }} className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700">
            <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear
          </button>
        </p>
      )}

      <SectionCard title={items ? `${items.length}${cursor ? '+' : ''} trip${items.length === 1 ? '' : 's'}` : 'Trips'} icon={Route}>
        {error ? (
          <Empty icon={Route} title="Could not load trips" hint={error} />
        ) : !items ? (
          <p className="py-10 text-center text-sm text-slate-500">Searching…</p>
        ) : items.length === 0 ? (
          <Empty icon={Route} title="No trips match" hint="Try a shorter search, another status, or a wider date range." />
        ) : (
          <>
            <div className="-mx-6 overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <th className="px-6 py-3">Trip</th>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">Driver</th>
                    <th className="px-3 py-3">Route</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Fare</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((t) => (
                    <tr key={t.id} onClick={() => navigate(`/trips/${t.id}`)} className="cursor-pointer align-top hover:bg-slate-50">
                      <td className="px-6 py-3">
                        <p className="font-mono text-xs font-bold text-slate-900">{tripRef(t.id)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{dateTime(t.requested_at)}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-900">{t.customer_name ?? 'Unnamed'}</p>
                        <p className="font-mono text-xs text-slate-500">{formatPhone(t.customer_phone)}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{t.driver_name ?? '—'}</td>
                      <td className="max-w-[260px] px-3 py-3">
                        <p className="truncate text-slate-700">{t.pickup_address ?? 'Pickup on map'}</p>
                        <p className="truncate text-xs text-slate-500">→ {t.drop_address ?? 'Destination on map'}</p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusPill status={t.status} />
                          {t.top_escalation && <LevelBadge level={t.top_escalation} />}
                        </div>
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums">
                        <p className="font-semibold text-slate-900">{rupees(t.fare_amount ?? t.estimated_fare)}</p>
                        {t.payment_status && <p className="text-[11px] text-slate-500">{t.payment_status.toLowerCase()}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cursor && (
              <div className="mt-4 text-center">
                <button type="button" onClick={loadMore} disabled={loadingMore} className="h-10 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </SectionCard>
    </div>
  )
}
