import { useState } from 'react'
import { CreditCard, Undo2 } from 'lucide-react'
import { api, ApiError } from '../../lib/apiClient.js'
import { Modal, SectionCard, Segmented, StatCard } from '../../components/app/Primitives.jsx'
import { useToast } from '../../context/toastStore.js'
import { useAuth } from '../../context/authStore.js'
import { useAdminPoll } from '../../components/admin/useAdminPoll.js'
import { Empty, relative, StatusPill } from '../../components/admin/Indicators.jsx'
import { FINANCE_ROLES, hasRole } from '../../components/admin/RequireRole.jsx'
import PageHeader from '../../components/admin/PageHeader.jsx'

const rupees = (n) => `₹${Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'AUTHORIZED', label: 'On hold' },
  { id: 'CAPTURED', label: 'Captured' },
  { id: 'REFUNDED', label: 'Refunded' },
  { id: 'FAILED', label: 'Failed' },
]

function RefundDialog({ payment, onClose, onDone }) {
  const { toast } = useToast()
  const refundable = payment ? payment.amount_captured - payment.amount_refunded : 0
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const value = amount === '' ? refundable : Number(amount)
  const valid = reason.trim().length >= 3 && value > 0 && value <= refundable + 1e-9

  const submit = async (e) => {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    try {
      await api.admin.refundPayment(payment.id, reason.trim(), amount === '' ? undefined : value)
      toast(`Refunded ${rupees(value)}`, 'success')
      onDone()
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Refund failed', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={Boolean(payment)} onClose={onClose} title="Issue a refund">
      {payment && (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-slate-600">
            {payment.customer_name ?? 'Customer'} · captured {rupees(payment.amount_captured)}
            {payment.amount_refunded > 0 && <>, already refunded {rupees(payment.amount_refunded)}</>}
          </p>
          <label className="block text-sm font-semibold text-slate-700">
            Amount
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              max={refundable}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`${refundable.toFixed(2)} (full refund)`}
              className="mt-2 block w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-slate-400"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Reason
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Driver arrived 40 minutes late"
              className="mt-2 block w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-slate-400"
            />
          </label>
          <p className="text-xs text-slate-500">Refunds are sent to the original payment method and recorded in the audit ledger.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || busy}
              className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-40"
            >
              {busy ? 'Refunding…' : `Refund ${rupees(value)}`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

export default function Payments() {
  const { user } = useAuth()
  const canRefund = hasRole(user, FINANCE_ROLES)
  const [status, setStatus] = useState('')
  const [refunding, setRefunding] = useState(null)
  const { data, error, refresh } = useAdminPoll(() => api.admin.payments({ status, limit: 100 }), 30000, [status])

  const items = data?.items ?? []
  const totals = data?.totals

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" subtitle="Customer fares: holds placed at booking, captured when the trip ends" />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Captured" value={rupees(totals?.captured)} />
        <StatCard label="On hold" value={rupees(totals?.held)} />
        <StatCard label="Refunded" value={rupees(totals?.refunded)} />
        <StatCard label="Owed by customers" value={rupees(totals?.due)} danger={totals?.due > 0} />
      </div>

      <SectionCard title="Transactions" icon={CreditCard} action={<Segmented options={FILTERS} value={status} onChange={setStatus} className="hidden md:flex" />}>
        <Segmented options={FILTERS} value={status} onChange={setStatus} className="mb-4 md:hidden" />
        {error ? (
          <Empty icon={CreditCard} title="Could not load payments" hint={error.message} />
        ) : !data ? (
          <p className="py-10 text-center text-sm text-slate-500">Loading payments…</p>
        ) : items.length === 0 ? (
          <Empty icon={CreditCard} title="No payments here yet" hint="Payments appear when a customer books a trip." />
        ) : (
          <div className="-mx-6 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Hold</th>
                  <th className="px-3 py-3 text-right">Captured</th>
                  <th className="px-3 py-3 text-right">Refunded</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((p) => (
                  <tr key={p.id} className="align-top">
                    <td className="px-6 py-3">
                      <p className="font-semibold text-slate-900">{p.customer_name ?? 'Unnamed customer'}</p>
                      <p className="mt-0.5 font-mono text-xs text-slate-500">{p.provider_payment_id ?? p.provider_order_id}</p>
                      {p.failure_reason && <p className="mt-1 text-xs text-brand-600">{p.failure_reason}</p>}
                    </td>
                    <td className="px-3 py-3"><StatusPill status={p.status} /></td>
                    <td className="px-3 py-3 text-right tabular-nums">{rupees(p.amount_authorized)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {rupees(p.amount_captured)}
                      {p.amount_due > 0 && <p className="text-xs text-brand-600">+{rupees(p.amount_due)} owed</p>}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{rupees(p.amount_refunded)}</td>
                    <td className="px-3 py-3 text-slate-500">{relative(p.created_at)}</td>
                    <td className="px-6 py-3 text-right">
                      {canRefund && p.status === 'CAPTURED' && (
                        <button
                          type="button"
                          onClick={() => setRefunding(p)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        >
                          <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <RefundDialog
        payment={refunding}
        onClose={() => setRefunding(null)}
        onDone={() => {
          setRefunding(null)
          void refresh()
        }}
      />
    </div>
  )
}
