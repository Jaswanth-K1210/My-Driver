import { useEffect, useState } from 'react'
import { cn } from '../../lib/utils.js'

/**
 * One severity scale, used everywhere a level appears.
 *
 * Brand red is reserved for L3 and above — an actual emergency — so that red
 * on this screen always means the same thing. L1/L2 use amber precisely so
 * they do not compete with it.
 */
const LEVEL_STYLES = {
  L0: 'bg-slate-100 text-slate-600',
  L1: 'bg-amber-100 text-amber-800',
  L2: 'bg-amber-200 text-amber-900',
  L3: 'bg-brand-100 text-brand-700',
  L4: 'bg-brand-500 text-white',
  L5: 'bg-brand-800 text-white',
}

export const LEVEL_MEANING = {
  L0: 'Nominal',
  L1: 'Automated anomaly',
  L2: 'Queued to desk, SLA running',
  L3: 'Agent engaged',
  L4: 'Emergency',
  L5: 'Law enforcement handoff',
}

export function LevelBadge({ level, className }) {
  if (!level) return <span className="text-xs text-slate-400">—</span>
  return (
    <span
      title={LEVEL_MEANING[level]}
      className={cn(
        'inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-black tabular-nums',
        LEVEL_STYLES[level] ?? LEVEL_STYLES.L0,
        className,
      )}
    >
      {level}
    </span>
  )
}

const STATUS_STYLES = {
  APPROVED: 'bg-emerald-100 text-emerald-800',
  VERIFIED: 'bg-emerald-100 text-emerald-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  SAFE: 'bg-emerald-100 text-emerald-800',
  PENDING: 'bg-amber-100 text-amber-800',
  TESTING: 'bg-amber-100 text-amber-800',
  UNDER_REVIEW: 'bg-amber-100 text-amber-800',
  SUBMITTED: 'bg-amber-100 text-amber-800',
  APPROVED_PAYOUT: 'bg-sky-100 text-sky-800',
  REJECTED: 'bg-brand-100 text-brand-700',
  SUSPENDED: 'bg-brand-100 text-brand-700',
  EXPIRED: 'bg-slate-200 text-slate-600',
  FAILED: 'bg-brand-100 text-brand-700',
  NO_ANSWER: 'bg-brand-100 text-brand-700',
  ESCALATED: 'bg-brand-500 text-white',
}

export function StatusPill({ status, className }) {
  if (!status) return <span className="text-xs text-slate-400">—</span>
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide',
        STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600',
        className,
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  )
}

/**
 * Counts down to the SLA deadline.
 *
 * Ticks locally rather than waiting for the next poll: a timer that only moves
 * every four seconds reads as broken, and the number an agent is watching is
 * the one telling them how long they have left.
 */
export function SlaTimer({ deadline, breached }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!deadline) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [deadline])

  if (!deadline) return <span className="text-xs text-slate-400">—</span>

  const remaining = Math.round((new Date(deadline).getTime() - now) / 1000)
  const over = breached || remaining <= 0
  const abs = Math.abs(remaining)
  const text = `${over ? '+' : ''}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-black tabular-nums',
        over ? 'bg-brand-500 text-white' : remaining < 60 ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-700',
      )}
      title={over ? 'SLA breached' : 'Time remaining to human contact'}
    >
      {text}
    </span>
  )
}

export function Empty({ icon: Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center">
      {Icon && <Icon className="h-8 w-8 text-slate-300" aria-hidden="true" />}
      <p className="mt-3 text-sm font-semibold text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

export function relative(iso) {
  if (!iso) return '—'
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}
