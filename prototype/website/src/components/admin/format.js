/** The trip reference customers see in their app and receipts: TRP-1A2B3C. */
export const tripRef = (id) => `TRP-${String(id).replace(/-/g, '').slice(0, 6).toUpperCase()}`

export const rupees = (n) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

export const dateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
    : '—'

export const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const REASONS = {
  SPEED_CEILING_BREACH: 'Speed limit exceeded',
  ROUTE_DEVIATION: 'Route deviation',
  ROUTE_DEVIATION_EXCEEDED: 'Route deviation',
  TELEMETRY_LOST: 'Lost contact with phone',
  UNUSUAL_STOP: 'Unusual stop',
  GPS_MISMATCH: 'Driver and customer GPS disagree',
  SOS: 'SOS raised',
  SILENT_SOS: 'Silent SOS raised',
}
/** Incident reasons in plain words. */
export const reasonLabel = (r) => REASONS[r] ?? humanize(r)

export { formatPhone } from '../../lib/utils.js'

/** Turn an API enum (NO_DRIVERS_FOUND) into a label (No drivers found). */
export const humanize = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '—')
