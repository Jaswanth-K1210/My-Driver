import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Award, ArrowLeft, Eye, FileText, Fingerprint, Moon, ShieldCheck } from 'lucide-react'
import { api, ApiError } from '../../lib/apiClient.js'
import { ask } from '../../components/admin/PromptDialog.jsx'
import { SectionCard } from '../../components/app/Primitives.jsx'
import { useToast } from '../../context/toastStore.js'
import { Empty, relative, StatusPill } from '../../components/admin/Indicators.jsx'
import { hasRole, OPS_ROLES } from '../../components/admin/RequireRole.jsx'
import { useAuth } from '../../context/authStore.js'
import { cn } from '../../lib/utils.js'

const BLOCKER_TEXT = {
  PAN_NOT_VERIFIED: 'PAN verification',
  AADHAAR_NOT_VERIFIED: 'Aadhaar verification',
  LICENCE_MISSING: 'Driving licence upload',
  LICENCE_NOT_VERIFIED: 'Driving licence review',
}

export default function DriverDetail() {
  const { id } = useParams()
  const { toast } = useToast()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [badges, setBadges] = useState([])
  const [busy, setBusy] = useState(false)

  const canAct = hasRole(user, OPS_ROLES)

  const load = useCallback(async () => {
    try {
      const [driver, catalogue] = await Promise.all([api.admin.driver(id), api.admin.badges()])
      setData(driver)
      setBadges(catalogue.items ?? [])
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not load driver', 'error')
    }
  }, [id, toast])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (label, fn) => {
    setBusy(true)
    try {
      await fn()
      toast(`${label} — done`, 'success')
      await load()
    } catch (err) {
      // The backend refuses an unqualified Night Shield grant or an incomplete
      // badge with a message naming exactly what is missing. Surface it as-is
      // rather than a generic failure, or the operator cannot act on it.
      toast(err instanceof ApiError ? err.message : `${label} failed`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const viewDocument = async (documentId) => {
    try {
      const { url } = await api.admin.documentUrl(documentId)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not open document', 'error')
    }
  }

  if (!data) return <p className="py-12 text-center text-sm text-slate-500">Loading driver…</p>

  // Defaults keep the page rendering if an older API omits a section.
  const { profile, documents = [], attempts = [], badges: held = [], night_shield: nightShield = [], kyc, approval_blockers: blockers = [] } = data
  const liveNightShield = nightShield.find((q) => !q.revoked_at && new Date(q.expires_at) > new Date())
  const heldCodes = new Set(held.filter((b) => !b.revoked_at).map((b) => b.badge_code))

  return (
    <div className="space-y-6">
      <Link
        to="/drivers"
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Drivers
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            {profile.full_name ?? 'Unnamed driver'}
          </h1>
          <p className="mt-1 font-mono text-sm text-slate-500">{profile.phone_number ?? '—'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={profile.onboarding_status} />
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold tabular-nums text-slate-600">
            score {Math.round(profile.mydriver_score)}
          </span>
          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold tabular-nums text-slate-600">
            {profile.total_trips} trips
          </span>
        </div>
      </header>

      {canAct && (
        <SectionCard title="Onboarding decision" icon={ShieldCheck}>
          <div className="flex flex-wrap gap-2">
            {['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'].map((status) => (
              <button
                key={status}
                type="button"
                disabled={busy || profile.onboarding_status === status || (status === 'APPROVED' && blockers.length > 0)}
                title={status === 'APPROVED' && blockers.length > 0 ? 'Complete identity checks first' : undefined}
                onClick={async () => {
                  const note = await ask({
                    title: `Set driver to ${status.replace(/_/g, ' ').toLowerCase()}`,
                    required: status === 'REJECTED' || status === 'SUSPENDED',
                    confirmLabel: 'Update status',
                    danger: status === 'REJECTED' || status === 'SUSPENDED',
                  })
                  if (note === null) return
                  void run(`Set ${status}`, () => api.admin.setDriverStatus(id, status, note || undefined))
                }}
                className={cn(
                  'rounded-xl border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-40',
                  status === 'APPROVED'
                    ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                    : status === 'UNDER_REVIEW'
                      ? 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      : 'border-brand-200 text-brand-700 hover:bg-brand-50',
                )}
              >
                {status.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          {blockers.length > 0 ? (
            <p className="mt-3 text-xs text-slate-500">
              Approval unlocks when these are done:{' '}
              <span className="font-semibold text-slate-700">{blockers.map((b) => BLOCKER_TEXT[b] ?? b).join(' · ')}</span>
            </p>
          ) : (
            <p className="mt-3 text-xs text-slate-500">
              Identity checks are complete. Review any remaining documents before approving.
            </p>
          )}
          {profile.review_note && (
            <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              Last note: {profile.review_note}
            </p>
          )}
        </SectionCard>
      )}

      <SectionCard title="Identity verification" icon={Fingerprint}>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ['PAN', kyc?.pan],
            ['Aadhaar', kyc?.aadhaar],
          ].map(([label, check]) => (
            <div key={label} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-slate-900">{label}</p>
                <StatusPill status={check?.status === 'NOT_STARTED' ? 'NOT_STARTED' : check?.status} />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {check?.last4 ? `Ending ${check.last4}` : 'Not submitted yet'}
                {check?.name && <> · Name on record: <span className="font-semibold text-slate-700">{check.name}</span></>}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Checked live with the issuing registry. MyDriver stores only the last four characters.
        </p>
      </SectionCard>

      <SectionCard title="Documents" icon={FileText}>
        {documents.length === 0 ? (
          <Empty icon={FileText} title="No documents submitted" />
        ) : (
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">{doc.kind.replace(/_/g, ' ')}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {doc.number_last4 ? `•••• ${doc.number_last4}` : 'no number'}
                    {doc.expires_on && ` · expires ${doc.expires_on}`} · {relative(doc.created_at)}
                  </p>
                  {doc.reject_reason && (
                    <p className="mt-1 text-xs text-brand-600">{doc.reject_reason}</p>
                  )}
                </div>
                <StatusPill status={doc.status} />
                <button
                  type="button"
                  onClick={() => viewDocument(doc.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  View
                </button>
                {canAct && doc.status === 'SUBMITTED' && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run('Verified', () => api.admin.reviewDocument(doc.id, 'VERIFIED'))}
                      className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      Verify
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        const reason = await ask({ title: `Reject ${doc.kind.replace(/_/g, ' ').toLowerCase()}`, placeholder: 'e.g. Photo is blurred; licence number unreadable', confirmLabel: 'Reject document', danger: true })
                        if (reason) {
                          void run('Rejected', () => api.admin.reviewDocument(doc.id, 'REJECTED', reason))
                        }
                      }}
                      className="rounded-xl border border-brand-200 px-3 py-2 text-xs font-bold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Opening a document is written to the audit ledger against your account.
        </p>
      </SectionCard>

      <SectionCard title="Assessments" icon={Award}>
        {attempts.length === 0 ? (
          <Empty icon={Award} title="No attempts yet" />
        ) : (
          <ul className="space-y-2">
            {attempts.map((attempt) => (
              <li
                key={attempt.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900">{attempt.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {attempt.kind} · attempt {attempt.attempt_no} · pass mark {attempt.passing_score}
                    {attempt.submitted_at && ` · ${relative(attempt.submitted_at)}`}
                  </p>
                </div>
                <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-black tabular-nums text-slate-700">
                  {attempt.score ?? '—'}
                </span>
                <StatusPill
                  status={attempt.passed === null ? 'PENDING' : attempt.passed ? 'VERIFIED' : 'REJECTED'}
                />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Badges" icon={Award}>
        <div className="mb-4 flex flex-wrap gap-2">
          {held.map((badge) => (
            <span
              key={badge.id}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold',
                badge.revoked_at ? 'bg-slate-100 text-slate-400 line-through' : 'bg-slate-900 text-white',
              )}
              title={
                badge.revoked_at
                  ? `Revoked: ${badge.revoke_reason}`
                  : badge.expires_at
                    ? `Expires ${new Date(badge.expires_at).toLocaleDateString('en-IN')}`
                    : 'No expiry'
              }
            >
              {badge.label}
              {canAct && !badge.revoked_at && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    const reason = await ask({ title: `Revoke ${badge.label}`, confirmLabel: 'Revoke badge', danger: true })
                    if (reason) {
                      void run('Badge revoked', () => api.admin.revokeBadge(id, badge.badge_code, reason))
                    }
                  }}
                  className="-mr-1 rounded px-1 text-white/60 hover:text-white"
                  aria-label={`Revoke ${badge.label}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {held.length === 0 && <p className="text-sm text-slate-500">No badges awarded.</p>}
        </div>

        {canAct && (
          <div className="border-t border-slate-100 pt-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Award a badge
            </p>
            <div className="flex flex-wrap gap-2">
              {badges
                .filter((badge) => !heldCodes.has(badge.code))
                .map((badge) => (
                  <button
                    key={badge.code}
                    type="button"
                    disabled={busy}
                    title={`Requires: ${badge.requires.join(', ') || 'nothing'}`}
                    onClick={() => run(`Awarded ${badge.label}`, () => api.admin.awardBadge(id, badge.code))}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    + {badge.label}
                  </button>
                ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              A badge grants the dispatch skill behind it, so it is refused unless every required
              assessment has been passed.
            </p>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Night Shield" icon={Moon}>
        {liveNightShield ? (
          <div className="rounded-2xl bg-slate-900 p-4 text-white">
            <p className="text-sm font-bold">Certified</p>
            <p className="mt-1 text-xs text-white/70">
              Qualified {new Date(liveNightShield.qualified_at).toLocaleDateString('en-IN')} ·
              re-verify by {new Date(liveNightShield.expires_at).toLocaleDateString('en-IN')}
            </p>
            <p className="mt-1 text-xs text-white/70">
              At issuance: {liveNightShield.tenure_days_at_check} days tenure, score{' '}
              {liveNightShield.score_at_check}
            </p>
            {canAct && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const reason = await ask({ title: 'Revoke Night Shield', confirmLabel: 'Revoke', danger: true })
                  if (reason) void run('Night Shield revoked', () => api.admin.revokeNightShield(id, reason))
                }}
                className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/20 disabled:opacity-50"
              >
                Revoke
              </button>
            )}
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-600">Not currently certified for night operations.</p>
            <p className="mt-1 text-xs text-slate-500">
              Requires 6 months tenure and a score of at least 85. Both are enforced by the
              database, so an unqualified grant is refused.
            </p>
            {canAct && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run('Night Shield granted', () => api.admin.qualifyNightShield(id))}
                className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Qualify for Night Shield
              </button>
            )}
          </div>
        )}

        {nightShield.length > 0 && (
          <ul className="mt-4 space-y-1 border-t border-slate-100 pt-4">
            {nightShield.map((qual) => (
              <li key={qual.id} className="text-xs text-slate-500">
                {new Date(qual.qualified_at).toLocaleDateString('en-IN')} →{' '}
                {new Date(qual.expires_at).toLocaleDateString('en-IN')}
                {qual.revoked_at && ` · revoked: ${qual.revoke_reason}`}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
