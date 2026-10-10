import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Activity, Car, Radio, Timer } from 'lucide-react'
import { api } from '../../lib/apiClient.js'
import PageHeader from '../../components/admin/PageHeader.jsx'
import { reasonLabel } from '../../components/admin/format.js'
import { StatCard, SectionCard } from '../../components/app/Primitives.jsx'
import { useAdminPoll } from '../../components/admin/useAdminPoll.js'
import { Empty, LevelBadge, relative, SlaTimer } from '../../components/admin/Indicators.jsx'
import { cn } from '../../lib/utils.js'

/**
 * The live board.
 *
 * Ordered by severity rather than plotted on a map: /v1/admin/trips/active
 * returns no coordinates, and for an agent triaging by escalation level a
 * sorted table is the faster read anyway. The map is a separate piece of work
 * that needs coordinates in the API first.
 */
export default function Board() {
  const navigate = useNavigate()

  const { data: stats } = useAdminPoll(() => api.admin.stats(), 4000)
  const { data: queue } = useAdminPoll(() => api.admin.escalations(false), 4000)
  const { data: trips, loading } = useAdminPoll(() => api.admin.activeTrips(), 4000)

  const items = queue?.items ?? []
  const active = trips ?? []

  return (
    <div className="space-y-6">
      <PageHeader title="Live board" subtitle="Safety Desk · refreshes every 4 seconds">
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Monitoring
        </span>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Car} label="Active trips" value={stats?.active_trips ?? '—'} />
        <StatCard icon={Activity} label="Open incidents" value={stats?.open_escalations ?? '—'} />
        <StatCard
          icon={Timer}
          label="SLA breached"
          value={stats?.sla_breached ?? '—'}
          danger={(stats?.sla_breached ?? 0) > 0}
        />
        <StatCard
          icon={AlertTriangle}
          label="At L4+"
          value={(stats?.by_level?.L4 ?? 0) + (stats?.by_level?.L5 ?? 0)}
          danger={((stats?.by_level?.L4 ?? 0) + (stats?.by_level?.L5 ?? 0)) > 0}
        />
      </div>

      <SectionCard title="Escalation queue" icon={AlertTriangle}>
        {items.length === 0 ? (
          <Empty icon={Activity} title="No open incidents" hint="Anomalies appear here the moment they are raised." />
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/incident/${item.id}`)}
                  className={cn(
                    'flex w-full flex-wrap items-center gap-3 rounded-2xl border p-4 text-left transition-colors',
                    item.sla_breached
                      ? 'border-brand-200 bg-brand-50 hover:bg-brand-100'
                      : 'border-slate-200 hover:bg-slate-50',
                  )}
                >
                  <LevelBadge level={item.level} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {reasonLabel(item.reason)}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {item.customer_name ?? 'Customer'} · {item.driver_name ?? 'Unassigned'} ·{' '}
                      {relative(item.opened_at)}
                    </p>
                  </div>
                  <SlaTimer deadline={item.sla_deadline} breached={item.sla_breached} />
                  {item.assigned_agent_id && (
                    <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                      Claimed
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={`Active trips (${active.length})`} icon={Radio}>
        {loading && active.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
        ) : active.length === 0 ? (
          <Empty icon={Car} title="No trips under way" />
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3">Level</th>
                  <th className="pb-2 pr-3">Customer</th>
                  <th className="pb-2 pr-3">Driver</th>
                  <th className="pb-2 pr-3">Vehicle</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3">Speed limit</th>
                  <th className="pb-2">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {active.map((trip) => (
                  <tr key={trip.trip_id} className={cn(trip.escalation_level && 'bg-brand-50/40')}>
                    <td className="py-3 pr-3"><LevelBadge level={trip.escalation_level} /></td>
                    <td className="py-3 pr-3 font-semibold text-slate-900">{trip.customer_name ?? '—'}</td>
                    <td className="py-3 pr-3 text-slate-700">{trip.driver_name ?? '—'}</td>
                    <td className="py-3 pr-3 font-mono text-xs text-slate-600">{trip.vehicle_plate ?? '—'}</td>
                    <td className="py-3 pr-3 text-xs font-bold text-slate-500">{trip.status}</td>
                    <td className="py-3 pr-3 tabular-nums text-slate-600">{trip.speed_ceiling_kmh} km/h</td>
                    <td className="py-3 text-xs text-slate-500">{relative(trip.last_seen)}</td>
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
