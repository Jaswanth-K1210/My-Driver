import { useState } from 'react'
import { Banknote, Calculator } from 'lucide-react'
import { api, ApiError } from '../../lib/apiClient.js'
import { SectionCard } from '../../components/app/Primitives.jsx'
import { useToast } from '../../context/toastStore.js'
import { useAdminPoll } from '../../components/admin/useAdminPoll.js'
import { Empty, relative, StatusPill } from '../../components/admin/Indicators.jsx'
import { formatINR } from '../../lib/utils.js'

/** Default to the calendar month to date — the period Finance actually runs. */
function defaultPeriod() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const iso = (d) => d.toISOString().slice(0, 10)
  return { start: iso(start), end: iso(end) }
}

export default function Payouts() {
  const { toast } = useToast()
  const [period, setPeriod] = useState(defaultPeriod)
  const [busy, setBusy] = useState(false)

  const { data: pending, refresh: refreshUnsettled } = useAdminPoll(
    () => api.admin.unsettled(period.start, period.end),
    60000,
    [period.start, period.end],
  )
  const { data: payouts, refresh: refreshPayouts } = useAdminPoll(
    () => api.admin.payouts({ limit: 100 }),
    30000,
  )

  const unsettled = pending?.items ?? []
  const runs = payouts?.items ?? []

  const act = async (label, fn) => {
    setBusy(true)
    try {
      await fn()
      toast(`${label} — done`, 'success')
      await Promise.all([refreshUnsettled(), refreshPayouts()])
    } catch (err) {
      toast(err instanceof ApiError ? err.message : `${label} failed`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">Payouts</h1>
        <p className="mt-1 text-sm text-slate-500">
          Settle completed trips · a trip can only ever be settled once
        </p>
      </header>

      <SectionCard title="Period" icon={Calculator}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
            From
            <input
              type="date"
              value={period.start}
              onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))}
              className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-slate-400"
            />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">
            To (exclusive)
            <input
              type="date"
              value={period.end}
              onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))}
              className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-slate-400"
            />
          </label>
        </div>
      </SectionCard>

      <SectionCard title={`Unsettled — ${unsettled.length} driver${unsettled.length === 1 ? '' : 's'}`} icon={Calculator}>
        {unsettled.length === 0 ? (
          <Empty icon={Banknote} title="Nothing to settle in this period" />
        ) : (
          <ul className="space-y-2">
            {unsettled.map((row) => (
              <li
                key={row.driver_id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{row.driver_name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {row.trip_count} trips · gross {formatINR(row.gross)} · fee{' '}
                    {formatINR(row.platform_fee)}
                  </p>
                </div>
                <span className="text-sm font-black tabular-nums text-slate-900">
                  {formatINR(row.gross - row.platform_fee)}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act('Payout generated', () =>
                      api.admin.generatePayout(row.driver_id, period.start, period.end),
                    )
                  }
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  Generate
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Payout runs" icon={Banknote}>
        {runs.length === 0 ? (
          <Empty icon={Banknote} title="No payouts yet" />
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3">Driver</th>
                  <th className="pb-2 pr-3">Period</th>
                  <th className="pb-2 pr-3">Trips</th>
                  <th className="pb-2 pr-3">Net</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="py-3 pr-3 font-semibold text-slate-900">{run.driver_name}</td>
                    <td className="py-3 pr-3 text-xs text-slate-500">
                      {String(run.period_start).slice(0, 10)} → {String(run.period_end).slice(0, 10)}
                    </td>
                    <td className="py-3 pr-3 tabular-nums text-slate-600">{run.trip_count}</td>
                    <td className="py-3 pr-3 font-bold tabular-nums text-slate-900">
                      {formatINR(run.net)}
                    </td>
                    <td className="py-3 pr-3"><StatusPill status={run.status} /></td>
                    <td className="py-3">
                      {run.status === 'PENDING' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => act('Approved', () => api.admin.advancePayout(run.id, 'APPROVED'))}
                          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Approve
                        </button>
                      )}
                      {run.status === 'APPROVED' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const reference = window.prompt('Bank transaction reference')
                            if (reference) {
                              void act('Marked paid', () =>
                                api.admin.advancePayout(run.id, 'PAID', reference),
                              )
                            }
                          }}
                          className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                        >
                          Mark paid
                        </button>
                      )}
                      {run.status === 'PAID' && (
                        <span className="text-xs text-slate-500">
                          {run.reference} · {relative(run.paid_at)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Approving and paying are separate steps so the same person need not do both.
        </p>
      </SectionCard>
    </div>
  )
}
