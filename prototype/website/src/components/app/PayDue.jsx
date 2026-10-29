import { useEffect, useState } from 'react'
import { CreditCard } from 'lucide-react'
import { api } from '../../lib/apiClient.js'
import { formatINR } from '../../lib/utils.js'

/**
 * "Pay ₹X" for what is still owed on a finished trip: the final fare came to
 * more than the amount held at booking. Renders nothing when nothing is due.
 * Same hosted checkout page as booking; with money owed it collects the
 * difference, as in the customer app.
 */
export default function PayDue({ tripId }) {
  const [payment, setPayment] = useState(null)
  const [waiting, setWaiting] = useState(false)
  const due = payment?.amount_due > 0 ? payment.amount_due : 0
  // Stops by itself once the balance is paid.
  const polling = waiting && due > 0

  useEffect(() => {
    if (!tripId) return undefined
    let live = true
    const load = () =>
      api.payments
        .forTrip(tripId)
        .then((r) => live && setPayment(r.payment ?? null))
        .catch(() => undefined)
    load()
    // The checkout tab tells the server, not this tab, so poll while it is open.
    const timer = polling ? setInterval(load, 3000) : null
    return () => {
      live = false
      if (timer) clearInterval(timer)
    }
  }, [tripId, polling])

  if (!due) return null

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-left">
      <p className="text-sm font-black text-brand-700">{formatINR(due)} still to pay</p>
      <p className="mt-0.5 text-xs text-slate-600">The final fare was more than the amount held at booking.</p>
      <button
        type="button"
        // Opened straight from the click: a tab opened after an await is popup-blocked.
        onClick={() => {
          window.open(api.payments.checkoutUrl(payment), '_blank', 'noopener')
          setWaiting(true)
        }}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3 text-sm font-black text-white transition-colors hover:bg-brand-600"
      >
        <CreditCard className="h-4 w-4" aria-hidden="true" />
        Pay {formatINR(due)}
      </button>
      {waiting && (
        <p className="mt-2 text-center text-xs text-slate-500">Checkout opened in a new tab. This updates on its own when you're done.</p>
      )}
    </div>
  )
}
