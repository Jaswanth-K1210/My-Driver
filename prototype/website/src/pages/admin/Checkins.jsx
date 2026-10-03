import { useState } from 'react'
import { PhoneCall, PhoneOff } from 'lucide-react'
import { api, ApiError } from '../../lib/apiClient.js'
import { SectionCard } from '../../components/app/Primitives.jsx'
import { useToast } from '../../context/toastStore.js'
import { useAdminPoll } from '../../components/admin/useAdminPoll.js'
import { Empty, relative, StatusPill } from '../../components/admin/Indicators.jsx'
import { cn } from '../../lib/utils.js'

const OUTCOMES = ['SAFE', 'NO_ANSWER', 'NEEDS_FOLLOWUP', 'ESCALATED']

/**
 * The 10-minute post-drop welfare call.
 *
 * Only night trips enter this queue — a row is written when a trip completes
 * inside the 22:00-05:00 window — so an empty list during the day is correct,
 * not a fault.
 */
export default function Checkins() {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const { data, refresh } = useAdminPoll(() => api.admin.checkins({ limit: 100 }), 10000)
  const items = data?.items ?? []
  const overdue = items.filter((item) => item.overdue)

  const record = async (tripId, outcome) => {
    const rawNotes = window.prompt(`Check-in outcome: ${outcome}. Notes (optional)`)
    if (rawNotes === null) return
    const notes = rawNotes.trim() ? rawNotes.trim() : undefined
    setBusy(true)
    try {
      await api.admin.recordCheckin(tripId, outcome, notes)
      toast('Check-in recorded', 'success')
      await refresh()
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not record check-in', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">Post-drop check-ins</h1>
        <p className="mt-1 text-sm text-slate-500">
          Night trips only · a call is due 10 minutes after drop-off
        </p>
      </header>

      <SectionCard
        title={`${items.length} pending`}
        icon={PhoneCall}
        action={
          overdue.length > 0 && (
            <span className="rounded-lg bg-brand-500 px-2 py-1 text-xs font-bold text-white">
              {overdue.length} overdue
            </span>
          )
        }
      >
        {items.length === 0 ? (
          <Empty icon={PhoneOff} title="No calls due" hint="Night trips queue a call automatically." />
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.trip_id}
                className={cn(
                  'rounded-2xl border p-4',
                  item.overdue ? 'border-brand-200 bg-brand-50' : 'border-slate-200',
                )}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {item.customer_name ?? 'Customer'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      driver {item.driver_name ?? '—'} · dropped {relative(item.completed_at)} ·{' '}
                      {item.drop_address ?? 'no address'}
                    </p>
                  </div>
                  {item.outcome === 'PENDING' ? (
                    <span
                      className={cn(
                        'rounded-lg px-2 py-0.5 text-xs font-bold',
                        item.overdue ? 'bg-brand-500 text-white' : 'bg-amber-100 text-amber-800',
                      )}
                    >
                      due {relative(item.due_at)}
                    </span>
                  ) : (
                    <StatusPill status={item.outcome} />
                  )}
                </div>

                {item.outcome === 'PENDING' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {OUTCOMES.map((outcome) => (
                      <button
                        key={outcome}
                        type="button"
                        disabled={busy}
                        onClick={() => record(item.trip_id, outcome)}
                        className={cn(
                          'rounded-xl border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50',
                          outcome === 'SAFE'
                            ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                            : outcome === 'ESCALATED'
                              ? 'border-brand-300 bg-brand-500 text-white hover:bg-brand-600'
                              : 'border-slate-200 text-slate-700 hover:bg-slate-50',
                        )}
                      >
                        {outcome.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
