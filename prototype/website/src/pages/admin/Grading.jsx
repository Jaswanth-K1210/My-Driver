import { useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { api, ApiError } from '../../lib/apiClient.js'
import PageHeader from '../../components/admin/PageHeader.jsx'
import { ask } from '../../components/admin/PromptDialog.jsx'
import { SectionCard } from '../../components/app/Primitives.jsx'
import { useToast } from '../../context/toastStore.js'
import { useAdminPoll } from '../../components/admin/useAdminPoll.js'
import { Empty, relative } from '../../components/admin/Indicators.jsx'

/**
 * The grading queue: assessments a driver has submitted that nobody has scored.
 *
 * A grader enters a score, never a verdict — whether that score is a pass is
 * the assessment's own threshold to decide, on the server.
 */
export default function Grading() {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [scores, setScores] = useState({})
  const { data, refresh } = useAdminPoll(() => api.admin.pendingAttempts({ limit: 100 }), 20000)
  const items = data?.items ?? []

  const grade = async (attempt) => {
    const raw = scores[attempt.id]
    const score = Number(raw)
    if (raw === undefined || raw === '' || Number.isNaN(score) || score < 0 || score > 100) {
      toast('Enter a score between 0 and 100', 'error')
      return
    }
    const notes = await ask({ title: `Submit score of ${score}`, label: 'Grader notes (optional)', required: false, confirmLabel: 'Submit grade' })
    if (notes === null) return
    setBusy(true)
    try {
      const result = await api.admin.gradeAttempt(attempt.id, score, notes || undefined)
      toast(`Graded ${score} — ${result.passed ? 'passed' : 'failed'}`, result.passed ? 'success' : 'info')
      setScores((prev) => ({ ...prev, [attempt.id]: '' }))
      await refresh()
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not grade', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Grading" subtitle="Submitted assessments awaiting a score" />

      <SectionCard title={`${items.length} awaiting`} icon={ClipboardCheck}>
        {items.length === 0 ? (
          <Empty icon={ClipboardCheck} title="Nothing to grade" />
        ) : (
          <ul className="space-y-2">
            {items.map((attempt) => (
              <li
                key={attempt.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{attempt.full_name}</p>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {attempt.title} · {attempt.kind} · attempt {attempt.attempt_no} · pass mark{' '}
                    {attempt.passing_score} · {relative(attempt.submitted_at)}
                  </p>
                </div>
                <input
                  type="number"
                  min="0"
                  max="100"
                  inputMode="numeric"
                  value={scores[attempt.id] ?? ''}
                  onChange={(e) => setScores((prev) => ({ ...prev, [attempt.id]: e.target.value }))}
                  placeholder="Score"
                  aria-label={`Score for ${attempt.full_name}`}
                  className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm tabular-nums outline-none focus:border-slate-400"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => grade(attempt)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  Submit
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
