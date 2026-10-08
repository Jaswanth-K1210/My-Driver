import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Moon, UserRoundCheck } from 'lucide-react'
import { api } from '../../lib/apiClient.js'
import PageHeader from '../../components/admin/PageHeader.jsx'
import { SectionCard } from '../../components/app/Primitives.jsx'
import { Segmented } from '../../components/app/Primitives.jsx'
import { useAdminPoll } from '../../components/admin/useAdminPoll.js'
import { Empty, StatusPill } from '../../components/admin/Indicators.jsx'

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'UNDER_REVIEW', label: 'Review' },
  { id: 'TESTING', label: 'Testing' },
  { id: 'PENDING', label: 'Pending' },
]

export default function Drivers() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('UNDER_REVIEW')

  // Slower than the live board: an onboarding queue does not change by the
  // second, and each poll is a heavier query.
  const { data, loading } = useAdminPoll(
    () => api.admin.drivers({ status: status || undefined, limit: 100 }),
    15000,
    [status],
  )
  const drivers = data?.items ?? []

  return (
    <div className="space-y-6">
      <PageHeader title="Drivers" subtitle="Onboarding review, identity checks, assessments, badges and Night Shield" />

      <Segmented options={FILTERS} value={status} onChange={setStatus} className="max-w-md" />

      <SectionCard title={`${drivers.length} driver${drivers.length === 1 ? '' : 's'}`} icon={UserRoundCheck}>
        {loading && drivers.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
        ) : drivers.length === 0 ? (
          <Empty icon={UserRoundCheck} title="Nothing in this queue" hint="New registrations appear here." />
        ) : (
          <ul className="space-y-2">
            {drivers.map((driver) => (
              <li key={driver.user_id}>
                <button
                  type="button"
                  onClick={() => navigate(`/admin/drivers/${driver.user_id}`)}
                  className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-slate-200 p-4 text-left transition-colors hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {driver.full_name ?? 'Unnamed driver'}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-slate-500">
                      {driver.phone_number ?? '—'}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {driver.night_shield_certified && (
                      <span
                        title="Night Shield certified"
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white"
                      >
                        <Moon className="h-3 w-3" aria-hidden="true" />
                        Night
                      </span>
                    )}
                    {driver.documents_pending > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                        <FileText className="h-3 w-3" aria-hidden="true" />
                        {driver.documents_pending} to review
                      </span>
                    )}
                    <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-600">
                      {driver.assessments_passed} passed
                    </span>
                    <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-bold tabular-nums text-slate-600">
                      score {Math.round(driver.mydriver_score)}
                    </span>
                    <StatusPill status={driver.onboarding_status} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
