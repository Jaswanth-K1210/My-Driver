import { useState } from 'react'
import { Receipt, Tags } from 'lucide-react'
import { api, ApiError } from '../../lib/apiClient.js'
import PageHeader from '../../components/admin/PageHeader.jsx'
import { SectionCard, Toggle } from '../../components/app/Primitives.jsx'
import { useAdminPoll } from '../../components/admin/useAdminPoll.js'
import { Empty } from '../../components/admin/Indicators.jsx'
import { ask } from '../../components/admin/PromptDialog.jsx'
import { hasRole } from '../../components/admin/RequireRole.jsx'
import { useAuth } from '../../context/authStore.js'
import { useToast } from '../../context/toastStore.js'
import { rupees } from '../../components/admin/format.js'

const input = 'h-10 w-28 rounded-xl border border-slate-200 bg-white px-3 text-right text-sm tabular-nums text-slate-900 focus:border-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-brand-500 aria-[invalid=true]:bg-brand-50'

// The server's bounds (admin-support/routes.ts). Checked here too so an
// empty box is never sent as 0 and a minus sign never reaches the server (CR-6).
const LIMITS = {
  per_km_rate: [1, 500],
  hourly_rate: [10, 10_000],
  included_km_per_hour: [0, 100],
  platform_fee: [0, 1_000],
  night_fee: [0, 1_000],
  urgent_fee: [0, 1_000],
  city_stop_fee: [0, 1_000],
  intercity_stop_fee: [0, 2_000],
  arrival_cancellation_fee: [0, 2_000],
}
const isValid = (k, v) => {
  if (v === '' || v == null) return false
  const n = Number(v)
  const [min, max] = LIMITS[k]
  return Number.isFinite(n) && n >= min && n <= max && (k !== 'included_km_per_hour' || Number.isInteger(n))
}
const limitHint = (k) => `${LIMITS[k][0]}–${LIMITS[k][1].toLocaleString('en-IN')}`

function TierRow({ card, canEdit, onSaved, platformFee }) {
  const { toast } = useToast()
  const [draft, setDraft] = useState({ per_km_rate: card.per_km_rate, hourly_rate: card.hourly_rate, included_km_per_hour: card.included_km_per_hour })
  const [saving, setSaving] = useState(false)
  const changed = Object.entries(draft).filter(([k, v]) => Number(v) !== Number(card[k]) || v === '')
  const invalid = Object.keys(draft).filter((k) => !isValid(k, draft[k]))

  const save = async () => {
    if (invalid.length > 0) return
    const summary = changed.map(([k, v]) => `${k.replace(/_/g, ' ')} ${card[k]} → ${v}`).join(', ')
    const reason = await ask({
      title: `Change ${card.label} prices`,
      label: 'Reason (kept in the audit ledger)',
      placeholder: summary,
      confirmLabel: 'Apply new prices',
    })
    if (reason === null) return
    setSaving(true)
    try {
      await api.admin.updateRateCard(card.skill_id, { ...Object.fromEntries(changed.map(([k, v]) => [k, Number(v)])), reason })
      toast(`${card.label} prices updated. New quotes use them now.`, 'success')
      onSaved()
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update prices', 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (active) => {
    try {
      await api.admin.updateRateCard(card.skill_id, { active })
      toast(`${card.label} ${active ? 'is bookable again' : 'is hidden from booking'}`, 'success')
      onSaved()
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update the tier', 'error')
    }
  }

  return (
    <tr className="align-middle">
      <td className="px-6 py-3">
        <p className="font-semibold text-slate-900">{card.label}</p>
        <p className="font-mono text-xs text-slate-500">{card.skill_id}</p>
      </td>
      {['per_km_rate', 'hourly_rate', 'included_km_per_hour'].map((k) => (
        <td key={k} className="px-3 py-3 text-right">
          <input
            type="number"
            inputMode="decimal"
            min={LIMITS[k][0]}
            max={LIMITS[k][1]}
            step={k === 'included_km_per_hour' ? 1 : 0.5}
            value={draft[k]}
            disabled={!canEdit}
            onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
            aria-label={`${card.label} ${k.replace(/_/g, ' ')}`}
            aria-invalid={!isValid(k, draft[k])}
            title={isValid(k, draft[k]) ? undefined : `Enter ${limitHint(k)}`}
            className={input}
          />
        </td>
      ))}
      <td className="px-3 py-3 text-right text-xs text-slate-500">
        10 km ≈ {rupees(Math.round(Number(draft.per_km_rate) * 10 + platformFee))}
      </td>
      <td className="px-3 py-3">
        <Toggle checked={card.active} onChange={canEdit ? toggleActive : () => {}} label={card.active ? 'Bookable' : 'Hidden'} />
      </td>
      <td className="px-6 py-3 text-right">
        {canEdit && changed.length > 0 && (
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setDraft({ per_km_rate: card.per_km_rate, hourly_rate: card.hourly_rate, included_km_per_hour: card.included_km_per_hour })} className="h-9 rounded-xl px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100">
              Reset
            </button>
            <button type="button" onClick={save} disabled={saving || invalid.length > 0} title={invalid.length > 0 ? 'Fix the highlighted values first' : undefined} className="h-9 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

const FEES = [
  ['platform_fee', 'Platform fee', 'Added to every trip. Kept by MyDriver, not paid to the driver.'],
  ['night_fee', 'Night fee', 'Added to trips that start between 22:00 and 05:00.'],
  ['urgent_fee', 'Urgent fee', 'Added when the customer asks for a driver in 5–10 minutes. Paid to the driver.'],
  ['city_stop_fee', 'Stop fee, city', 'Per extra stop on a within-city trip.'],
  ['intercity_stop_fee', 'Stop fee, outstation', 'Per extra stop on an outstation trip.'],
  ['arrival_cancellation_fee', 'Cancellation after arrival', 'Charged when the customer cancels or turns the driver away after the driver has arrived. Paid to the driver in full.'],
]

/** Fees on top of the tier rate. Same audited flow as a tier change. */
function FeesCard({ canEdit, fees, error, refresh }) {
  const { toast } = useToast()
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const values = draft ?? fees
  const changed = fees && draft ? FEES.filter(([k]) => Number(draft[k]) !== Number(fees[k]) || draft[k] === '') : []
  const invalid = draft ? FEES.filter(([k]) => !isValid(k, draft[k])) : []

  const save = async () => {
    if (invalid.length > 0) return
    const summary = changed.map(([k, name]) => `${name} ₹${fees[k]} → ₹${draft[k]}`).join(', ')
    const reason = await ask({
      title: 'Change fees',
      label: 'Reason (kept in the audit ledger)',
      placeholder: summary,
      confirmLabel: 'Apply new fees',
    })
    if (reason === null) return
    setSaving(true)
    try {
      await api.admin.updateFees({ ...Object.fromEntries(changed.map(([k]) => [k, Number(draft[k])])), reason })
      toast('Fees updated. New quotes use them now.', 'success')
      setDraft(null)
      refresh()
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not update the fees', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard title="Fees" icon={Receipt}>
      {error ? (
        <Empty icon={Receipt} title="Could not load fees" hint={error.message} />
      ) : !values ? (
        <p className="py-10 text-center text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="divide-y divide-slate-100">
            {FEES.map(([k, name, hint]) => (
              <div key={k} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{name}</p>
                  <p className="text-xs text-slate-500">{hint}</p>
                </div>
                <input
                  type="number"
                  min={LIMITS[k][0]}
                  max={LIMITS[k][1]}
                  step={1}
                  value={values[k]}
                  disabled={!canEdit}
                  onChange={(e) => setDraft({ ...values, [k]: e.target.value })}
                  className={input}
                  aria-label={`${name} in rupees`}
                  aria-invalid={!isValid(k, values[k])}
                  title={isValid(k, values[k]) ? undefined : `Enter ₹${limitHint(k)}`}
                />
              </div>
            ))}
          </div>
          {canEdit && invalid.length > 0 && (
            <p role="alert" className="mt-3 text-right text-xs font-semibold text-brand-700">
              {invalid.map(([k, name]) => `${name}: enter ₹${limitHint(k)}`).join(' · ')}
            </p>
          )}
          {canEdit && changed.length > 0 && (
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDraft(null)} className="h-9 rounded-xl px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                Discard
              </button>
              <button type="button" onClick={save} disabled={saving || invalid.length > 0} className="h-9 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50">
                {saving ? 'Saving…' : 'Save fees'}
              </button>
            </div>
          )}
        </>
      )}
    </SectionCard>
  )
}

export default function Pricing() {
  const { user } = useAuth()
  const canEdit = hasRole(user, ['FINANCE', 'SUPER_ADMIN'])
  const { data, error, refresh } = useAdminPoll(() => api.admin.rateCards(), 60000)
  const cards = data?.items ?? []
  const feesPoll = useAdminPoll(() => api.admin.fees(), 60000)
  const platformFee = feesPoll.data?.platform_fee ?? 0

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pricing"
        subtitle={canEdit ? 'Driver tier rates. Changes apply to new quotes immediately and are recorded in the audit ledger.' : 'Driver tier rates. Finance and super admins can change them.'}
      />
      <SectionCard title="Driver tiers" icon={Tags}>
        {error ? (
          <Empty icon={Tags} title="Could not load prices" hint={error.message} />
        ) : !data ? (
          <p className="py-10 text-center text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="-mx-6 overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-3">Tier</th>
                  <th className="px-3 py-3 text-right">Per km (₹)</th>
                  <th className="px-3 py-3 text-right">Per hour (₹)</th>
                  <th className="px-3 py-3 text-right">Km included / hour</th>
                  <th className="px-3 py-3 text-right">Example</th>
                  <th className="px-3 py-3">Booking</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cards.map((card) => <TierRow key={card.skill_id} card={card} canEdit={canEdit} onSaved={refresh} platformFee={platformFee} />)}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-slate-500">
          The tier is chosen automatically from the customer's car: luxury brands use Lux, large SUVs use SUV, automatics
          use Auto Spec., everything else Standard. The fees below are added on top. Final fares are worked out when a trip
          ends, so a trip in progress ends on the new prices, but is never charged more than its payment hold.
        </p>
      </SectionCard>
      <FeesCard canEdit={canEdit} fees={feesPoll.data} error={feesPoll.error} refresh={feesPoll.refresh} />
    </div>
  )
}
