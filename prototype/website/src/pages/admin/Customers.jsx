import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck, UsersRound } from 'lucide-react'
import { api, ApiError } from '../../lib/apiClient.js'
import PageHeader from '../../components/admin/PageHeader.jsx'
import { SectionCard } from '../../components/app/Primitives.jsx'
import { Empty } from '../../components/admin/Indicators.jsx'
import { SearchBox, useDebounced } from '../../components/admin/SearchBox.jsx'
import { dateTime, formatPhone, shortDate } from '../../components/admin/format.js'

export default function Customers() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const query = useDebounced(q.trim(), 300)
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setItems(null)
    api.admin
      .customers({ q: query || undefined, limit: 50 })
      .then((r) => !cancelled && setItems(r.items))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Could not load customers'))
    return () => {
      cancelled = true
    }
  }, [query])

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" subtitle="Look up a customer by name, phone or email to see their trips, payments and safety settings" />
      <SearchBox value={q} onChange={setQ} placeholder="Name, phone or email" className="lg:max-w-md" autoFocus />

      <SectionCard title={query ? `Matches for “${query}”` : 'Most recently active'} icon={UsersRound}>
        {error ? (
          <Empty icon={UsersRound} title="Could not load customers" hint={error} />
        ) : !items ? (
          <p className="py-10 text-center text-sm text-slate-500">Searching…</p>
        ) : items.length === 0 ? (
          <Empty icon={UsersRound} title="No customers match" hint="Try the last digits of their phone number." />
        ) : (
          <div className="-mx-6 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-3 py-3">Contact</th>
                  <th className="px-3 py-3 text-right">Trips</th>
                  <th className="px-3 py-3">Last trip</th>
                  <th className="px-6 py-3">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/customers/${c.id}`)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-6 py-3">
                      <p className="flex items-center gap-1.5 font-semibold text-slate-900">
                        {c.full_name ?? 'Unnamed customer'}
                        {c.id_verified && <ShieldCheck className="h-3.5 w-3.5 text-slate-700" aria-label="ID verified" />}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-mono text-xs text-slate-700">{formatPhone(c.phone_number) || '—'}</p>
                      <p className="text-xs text-slate-500">{c.email ?? ''}</p>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-900">{c.trips}</td>
                    <td className="px-3 py-3 text-slate-600">{dateTime(c.last_trip_at)}</td>
                    <td className="px-6 py-3 text-slate-600">{shortDate(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
