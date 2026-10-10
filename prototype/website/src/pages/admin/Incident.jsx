import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, CheckCircle2, FileLock2, PhoneCall, ShieldAlert, TrendingUp, Users,
} from 'lucide-react'
import { api, ApiError } from '../../lib/apiClient.js'
import { ask } from '../../components/admin/PromptDialog.jsx'
import { SectionCard } from '../../components/app/Primitives.jsx'
import { useToast } from '../../context/toastStore.js'
import { useAdminPoll } from '../../components/admin/useAdminPoll.js'
import { LevelBadge, LEVEL_MEANING, relative, SlaTimer, StatusPill } from '../../components/admin/Indicators.jsx'
import { cn } from '../../lib/utils.js'
import { useAuth } from '../../context/authStore.js'
import { hasRole, OPS_ROLES } from '../../components/admin/RequireRole.jsx'

const LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5']

function Action({ icon: Icon, label, onClick, busy, tone = 'default' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        'flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition-colors disabled:opacity-50',
        tone === 'danger'
          ? 'bg-brand-500 text-white hover:bg-brand-600'
          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  )
}

export default function Incident() {
  const { user } = useAuth()
  const canRelease = hasRole(user, OPS_ROLES)
  const { id } = useParams()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const { data, refresh } = useAdminPoll(() => api.admin.escalation(id), 5000, [id])
  const escalation = data?.escalation
  const events = data?.events ?? []

  /**
   * Every desk action runs through here so a failure always surfaces as a
   * toast rather than a silent no-op. An agent must know whether the call
   * they just triggered actually happened.
   */
  const run = async (label, fn) => {
    setBusy(true)
    try {
      await fn()
      toast(`${label} — done`, 'success')
      await refresh()
    } catch (err) {
      toast(err instanceof ApiError ? err.message : `${label} failed`, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!escalation) {
    return <p className="py-12 text-center text-sm text-slate-500">Loading incident…</p>
  }

  const resolved = escalation.status === 'RESOLVED'
  const nextLevels = LEVELS.slice(LEVELS.indexOf(escalation.level) + 1)

  return (
    <div className="space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Live board
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <LevelBadge level={escalation.level} className="text-sm" />
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              {escalation.reason.replace(/_/g, ' ')}
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {LEVEL_MEANING[escalation.level]} · opened {relative(escalation.opened_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={escalation.status} />
          {!resolved && <SlaTimer deadline={escalation.sla_deadline} />}
        </div>
      </header>

      {!resolved && (
        <SectionCard title="Desk actions" icon={ShieldAlert}>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {escalation.status === 'OPEN' && (
              <Action
                icon={CheckCircle2}
                label="Acknowledge"
                busy={busy}
                onClick={() => run('Acknowledged', () => api.admin.acknowledge(id))}
              />
            )}
            <Action
              icon={PhoneCall}
              label="Call driver"
              busy={busy}
              onClick={() => run('Calling driver', () => api.admin.call(id, 'DRIVER'))}
            />
            <Action
              icon={PhoneCall}
              label="Call customer"
              busy={busy}
              onClick={() => run('Calling customer', () => api.admin.call(id, 'CUSTOMER'))}
            />
            <Action
              icon={Users}
              label="Notify guardians"
              busy={busy}
              onClick={() => run('Guardians notified', () => api.admin.notifyGuardians(id))}
            />
            {/* The server allows OPS_MANAGER and SUPER_ADMIN only; agents never see it. */}
            {canRelease && (
            <Action
              icon={FileLock2}
              label="Release evidence"
              tone="danger"
              busy={busy}
              onClick={async () => {
                // L5 is a law-enforcement handoff and is not reversible, so it
                // is the one action behind an explicit confirmation.
                const recipient = await ask({
                  title: 'Release evidence to law enforcement',
                  label: 'Receiving authority',
                  placeholder: 'e.g. Dial 112, T-Safe, Madhapur PS',
                  confirmLabel: 'Release evidence',
                  danger: true,
                })
                if (recipient) {
                  void run('Evidence released', () => api.admin.releaseEvidence(id, recipient))
                }
              }}
            />
            )}
          </div>

          <div className="mt-5 border-t border-slate-100 pt-5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Promote
            </p>
            {nextLevels.length === 0 ? (
              <p className="text-xs text-slate-500">Already at the top of the ladder.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {/* Levels only ever rise — the backend rejects a downgrade, so
                    only higher levels are offered here. */}
                {nextLevels.map((level) => (
                  <button
                    key={level}
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      const note = await ask({ title: `Promote to ${level}`, placeholder: 'What did you observe?', confirmLabel: `Promote to ${level}`, danger: level >= 'L4' })
                      if (note) void run(`Promoted to ${level}`, () => api.admin.promote(id, level, note))
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                    {level}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 border-t border-slate-100 pt-5">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const resolution = await ask({ title: 'Resolve incident', label: 'Resolution', placeholder: 'What happened, and how was it closed?', confirmLabel: 'Resolve' })
                if (resolution) void run('Resolved', () => api.admin.resolve(id, resolution))
              }}
              className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Resolve incident
            </button>
          </div>
        </SectionCard>
      )}

      {resolved && (
        <SectionCard title="Resolution">
          <p className="text-sm text-slate-700">{escalation.resolution}</p>
          <p className="mt-2 text-xs text-slate-500">Closed {relative(escalation.resolved_at)}</p>
        </SectionCard>
      )}

      <SectionCard title="Timeline">
        <ol className="space-y-3">
          {events.map((event, index) => (
            <li key={`${event.created_at}-${index}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                {index < events.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200" />}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <p className="text-sm font-bold text-slate-900">{event.type.replace(/_/g, ' ')}</p>
                <p className="text-xs text-slate-500">
                  {event.actor_role ?? 'System'} · {relative(event.created_at)}
                </p>
                {Object.keys(event.payload ?? {}).length > 0 && (
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                )}
              </div>
            </li>
          ))}
        </ol>
      </SectionCard>
    </div>
  )
}
