import { useState } from 'react'
import { ScrollText, Search } from 'lucide-react'
import { api } from '../../lib/apiClient.js'
import { SectionCard } from '../../components/app/Primitives.jsx'
import { useAdminPoll } from '../../components/admin/useAdminPoll.js'
import { Empty, relative } from '../../components/admin/Indicators.jsx'

/**
 * The append-only ledger.
 *
 * Read-only by construction: the table rejects UPDATE and DELETE at the
 * database level, so there is nothing to offer here but search.
 */
export default function Audit() {
  const [filters, setFilters] = useState({ action: '', subject: '' })
  const [applied, setApplied] = useState({ action: '', subject: '' })

  const { data, loading } = useAdminPoll(
    () => api.admin.audit({ ...applied, limit: 200 }),
    60000,
    [applied.action, applied.subject],
  )
  const items = data?.items ?? []

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">Audit ledger</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every desk and ops action, including reads. Append-only — enforced by the database.
        </p>
      </header>

      <SectionCard title="Filter" icon={Search}>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            setApplied(filters)
          }}
        >
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Action
            <input
              value={filters.action}
              onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}
              placeholder="VIEW_DOCUMENT"
              className="mt-1 block w-48 rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm font-normal normal-case tracking-normal outline-none focus:border-slate-400"
            />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Subject
            <input
              value={filters.subject}
              onChange={(e) => setFilters((f) => ({ ...f, subject: e.target.value }))}
              placeholder="trip or user id"
              className="mt-1 block w-72 rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm font-normal normal-case tracking-normal outline-none focus:border-slate-400"
            />
          </label>
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
          >
            Search
          </button>
        </form>
      </SectionCard>

      <SectionCard title={`${items.length} entries`} icon={ScrollText}>
        {loading && items.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
        ) : items.length === 0 ? (
          <Empty icon={ScrollText} title="No matching entries" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                <span className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                  {entry.action}
                </span>
                <span className="text-sm font-semibold text-slate-900">
                  {entry.actor_name ?? 'System'}
                </span>
                <span className="text-xs text-slate-500">{entry.actor_role ?? '—'}</span>
                {entry.subject && (
                  <span className="font-mono text-[11px] text-slate-400">{entry.subject}</span>
                )}
                <span className="ml-auto text-xs text-slate-500">{relative(entry.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
