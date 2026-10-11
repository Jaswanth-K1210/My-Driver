export const shortTripId = (id) => `TRP-${String(id).replace(/-/g, '').slice(0, 6).toUpperCase()}`

const STATUS_LABEL = {
  REQUESTED: 'Finding a driver',
  MATCHED: 'Driver offered, awaiting acceptance',
  HANDSHAKE_PENDING: 'Driver on the way',
  IN_TRIP: 'On the way',
  COMPLETED: 'Trip complete',
  CANCELLED: 'Trip cancelled',
  NO_DRIVERS_FOUND: 'No drivers available nearby',
  ESCALATED: 'On the way · Safety Desk involved',
}

/** Short status for a row in the trip history. */
const HISTORY_LABEL = {
  REQUESTED: 'Finding a driver',
  MATCHED: 'Finding a driver',
  HANDSHAKE_PENDING: 'Driver on the way',
  IN_TRIP: 'In progress',
  ESCALATED: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_DRIVERS_FOUND: 'No driver found',
}

export const ACTIVE_STATUSES = ['REQUESTED', 'MATCHED', 'HANDSHAKE_PENDING', 'IN_TRIP', 'ESCALATED']

/**
 * Adapts a server TripView into the shape the screens render. Every field is
 * the server's; where it sent nothing, the screen gets a plain word, never a
 * guessed place name.
 */
export function toViewTrip(trip) {
  if (!trip) return null
  const hourly = trip.booking_type === 'HOURLY'

  return {
    id: shortTripId(trip.id),
    serverId: trip.id,
    status: trip.status,
    statusLabel: STATUS_LABEL[trip.status] ?? trip.status,
    historyLabel: HISTORY_LABEL[trip.status] ?? trip.status,
    from: trip.pickup_address ?? 'Pickup',
    to: trip.drop_address ?? (hourly ? `${trip.hourly_package_hours}-hour hire` : 'Destination'),
    skill: trip.required_certification,
    ceiling: trip.speed_ceiling_kmh,
    // The final fare once the trip is complete; the estimate until then.
    fare: Math.round(trip.fare_amount ?? trip.estimated_fare ?? 0),
    // Unrounded, for the receipt, where the lines must add up to the paise.
    fareExact: trip.fare_amount ?? trip.estimated_fare ?? 0,
    fareIsFinal: trip.fare_amount != null,
    distanceKm: trip.distance_km ?? trip.estimated_distance_km ?? 0,
    durationMin: trip.duration_min,
    pickup: trip.pickup,
    drop: trip.drop,
    completedAt: trip.completed_at,
    requestedAt: trip.requested_at,
    driver: trip.driver
      ? {
          name: trip.driver.name ?? 'Your driver',
          initials: trip.driver.initials ?? 'MD',
          vehicle: trip.driver.vehicle_model ?? 'Vehicle details pending',
          plate: trip.driver.vehicle_plate ?? '—',
          rating: trip.driver.rating ?? null,
          score: trip.driver.mydriver_score ?? null,
        }
      : null,
  }
}

const formatWhen = (date) =>
  date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

/** A row in the trip history. */
export function toHistoryRow(trip) {
  const view = toViewTrip(trip)
  const when = new Date(trip.completed_at ?? trip.requested_at)
  return {
    ...view,
    date: formatWhen(when),
    driverName: view.driver?.name ?? null,
  }
}

const PAYMENT_LABEL = {
  CREATED: 'Not paid',
  AUTHORIZED: 'Amount held, not yet charged',
  CAPTURED: 'Paid',
  RELEASED: 'Hold released, nothing charged',
  REFUNDED: 'Refunded',
  FAILED: 'Payment failed',
}

export const paymentLabel = (payment) => (payment ? (PAYMENT_LABEL[payment.status] ?? payment.status) : 'No payment on record')

const rupees = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * The money lines of a receipt, from the server's payment record. `payment`
 * is null for a trip booked while payments were switched off.
 */
export function receiptLines(trip, payment) {
  const lines = [{ label: trip.fareIsFinal ? 'Final fare' : 'Estimated fare', value: rupees(trip.fareExact) }]
  if (!payment) return lines
  lines.push({ label: 'Held at booking', value: rupees(payment.amount_authorized) })
  if (payment.amount_captured > 0) lines.push({ label: 'Charged', value: rupees(payment.amount_captured) })
  if (payment.amount_refunded > 0) lines.push({ label: 'Refunded', value: rupees(payment.amount_refunded) })
  if (payment.amount_due > 0) lines.push({ label: 'Still to pay', value: rupees(payment.amount_due), alert: true })
  return lines
}

/** Plain text for the share sheet. */
export function receiptText(trip, payment) {
  return [
    `MyDriver receipt · Trip ${trip.id}`,
    trip.date,
    `${trip.from} to ${trip.to}`,
    trip.driverName ? `Driver: ${trip.driverName}` : null,
    `Driver tier: ${trip.skill}`,
    trip.status === 'COMPLETED' ? `Distance: ${Number(trip.distanceKm).toFixed(1)} km` : null,
    trip.durationMin ? `Duration: ${trip.durationMin} min` : null,
    `Status: ${trip.historyLabel}`,
    '',
    ...receiptLines(trip, payment).map((l) => `${l.label}: ${l.value}`),
    `Payment: ${paymentLabel(payment)}`,
    payment?.provider_payment_id ? `Payment reference: ${payment.provider_payment_id}` : null,
  ]
    .filter((line) => line !== null)
    .join('\n')
}
