import { useNavigate } from 'react-router-dom'
import { Moon, TimerReset, UserCheck } from 'lucide-react'
import { api } from '../../lib/apiClient.js'
import PageHeader from '../../components/admin/PageHeader.jsx'
import { SectionCard } from '../../components/app/Primitives.jsx'
import { useAdminPoll } from '../../components/admin/useAdminPoll.js'
import { Empty, StatusPill } from '../../components/admin/Indicators.jsx'
import { cn } from '../../lib/utils.js'

/**
 * Night Shield operations.
 *
 * Two queues that both exist because a date in a column is not a control:
 * qualifications lapsing within 14 days need re-verifying before they expire,
 * and tonight's shift-start checks decide who may drive at all.
 */
export default function NightShield() {
  const navigate = useNavigate()
  const { data: expiring } = useAdminPoll(() => api.admin.nightShieldExpiring(14), 30000)
  const { data: checks } = useAdminPoll(() => api.admin.shiftChecks(), 15000)

  const lapsing = expiring?.items ?? []
  const tonight = checks?.items ?? []
  const failed = tonight.filter((c) => !c.passed)

  return (
    <div className="space-y-6">
      <PageHeader title="Night Shield" subtitle="Night protocol 22:00–05:00 IST · qualification re-verified every 90 days" />

      <SectionCard title="Re-verification due" icon={TimerReset}>
        {lapsing.length === 0 ? (
          <Empty icon={TimerReset} title="Nothing lapsing in 14 days" />
        ) : (
          <ul className="space-y-2">
            {lapsing.map((driver) => (
              <li key={driver.driver_id}>
                <button
                  type="button"
                  onClick={() => navigate(`/drivers/${driver.driver_id}`)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors',
                    driver.days_remaining <= 3
                      ? 'border-brand-200 bg-brand-50 hover:bg-brand-100'
                      : 'border-slate-200 hover:bg-slate-50',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">{driver.full_name}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">{driver.phone_number}</p>
                  </div>
                  <span
                    className={cn(
                      'rounded-lg px-2 py-0.5 text-xs font-black tabular-nums',
                      driver.days_remaining <= 3 ? 'bg-brand-500 text-white' : 'bg-amber-100 text-amber-800',
                    )}
                  >
                    {driver.days_remaining}d
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Tonight's shift checks"
        icon={UserCheck}
        action={
          failed.length > 0 && (
            <span className="rounded-lg bg-brand-100 px-2 py-1 text-xs font-bold text-brand-700">
              {failed.length} failed
            </span>
          )
        }
      >
        {tonight.length === 0 ? (
          <Empty
            icon={Moon}
            title="No shift checks tonight"
            hint="A driver records liveness and reaction at shift start."
          />
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3">Driver</th>
                  <th className="pb-2 pr-3">Liveness</th>
                  <th className="pb-2 pr-3">Reaction</th>
                  <th className="pb-2">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tonight.map((check) => (
                  <tr key={check.id} className={cn(!check.passed && 'bg-brand-50/40')}>
                    <td className="py-3 pr-3 font-semibold text-slate-900">{check.full_name}</td>
                    <td className="py-3 pr-3 tabular-nums text-slate-600">
                      {check.liveness_confidence == null
                        ? '—'
                        : `${Math.round(check.liveness_confidence * 100)}%`}
                      <span className={cn('ml-2 text-xs font-bold', check.liveness_passed ? 'text-emerald-600' : 'text-brand-600')}>
                        {check.liveness_passed ? 'pass' : 'fail'}
                      </span>
                    </td>
                    <td className="py-3 pr-3 tabular-nums text-slate-600">
                      {check.reaction_ms == null ? '—' : `${check.reaction_ms} ms`}
                      <span className={cn('ml-2 text-xs font-bold', check.reaction_passed ? 'text-emerald-600' : 'text-brand-600')}>
                        {check.reaction_passed ? 'pass' : 'fail'}
                      </span>
                    </td>
                    <td className="py-3">
                      <StatusPill status={check.passed ? 'VERIFIED' : 'REJECTED'} />
                    </td>
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
