import { useState } from 'react'
import { Tags } from 'lucide-react'
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

const input = 'h-10 w-28 rounded-xl border border-slate-200 bg-white px-3 text-right text-sm tabular-nums text-slate-900 focus:border-slate-400 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500'

function TierRow({ card, canEdit, onSaved }) {
  const { toast } = useToast()
  const [draft, setDraft] = useState({ per_km_rate: card.per_km_rate, hourly_rate: card.hourly_rate, included_km_per_hour: card.included_km_per_hour })
  const [saving, setSaving] = useState(false)
  const changed = Object.entries(draft).filter(([k, v]) => Number(v) !== Number(card[k]))

  const save = async () => {
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
            min="0"
            step={k === 'included_km_per_hour' ? 1 : 0.5}
            value={draft[k]}
            disabled={!canEdit}
            onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
            aria-label={`${card.label} ${k.replace(/_/g, ' ')}`}
            className={input}
          />
        </td>
      ))}
      <td className="px-3 py-3 text-right text-xs text-slate-500">
        10 km ≈ {rupees(Math.round(Number(draft.per_km_rate) * 10 + 19))}
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
            <button type="button" onClick={save} disabled={saving} className="h-9 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

export default function Pricing() {
  const { user } = useAuth()
  const canEdit = hasRole(user, ['FINANCE', 'SUPER_ADMIN'])
  const { data, error, refresh } = useAdminPoll(() => api.admin.rateCards(), 60000)
  const cards = data?.items ?? []

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
                {cards.map((card) => <TierRow key={card.skill_id} card={card} canEdit={canEdit} onSaved={refresh} />)}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-xs text-slate-500">
          The ₹19 platform fee and ₹30 night fee (22:00 to 05:00) are added on top. Final fares are worked out when a trip
          ends, so a trip in progress ends on the new rates, but is never charged more than its payment hold.
        </p>
      </SectionCard>
    </div>
  )
}
