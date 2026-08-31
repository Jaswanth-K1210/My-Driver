import { PICKUP, DROPS } from '../data/mock'

export const shortTripId = (id) => `TRP-${String(id).replace(/-/g, '').slice(0, 6).toUpperCase()}`

const STATUS_LABEL = {
  REQUESTED: 'Finding a driver',
  MATCHED: 'Driver offered — awaiting acceptance',
  HANDSHAKE_PENDING: 'Driver arriving — verify at the vehicle',
  IN_TRIP: 'On the way',
  COMPLETED: 'Trip complete',
  CANCELLED: 'Trip cancelled',
  NO_DRIVERS_FOUND: 'No drivers available nearby',
  ESCALATED: 'Safety Desk engaged',
}

import { CITY_LOCATIONS, INTERCITY_DESTINATIONS, AIRPORT_LOCATIONS } from '../data/mock'

const nearestDropName = (drop) => {
  if (!drop) return 'Destination'
  let best = null
  let bestDist = Infinity
  const allDrops = [...DROPS, ...CITY_LOCATIONS, ...INTERCITY_DESTINATIONS, ...AIRPORT_LOCATIONS]
  for (const d of allDrops) {
    if (d.lat == null || d.lng == null) continue
    const dist = Math.abs(d.lat - drop.lat) + Math.abs(d.lng - drop.lng)
    if (dist < bestDist) {
      bestDist = dist
      best = d
    }
  }
  return best?.name ?? 'Destination'
}

/**
 * Adapts a server TripView into the shape the existing screens render, so the
 * UI did not have to be rewritten around a new field set.
 */
export function toViewTrip(trip, config) {
  if (!trip) return null
  const hourly = trip.booking_type === 'HOURLY'

  return {
    id: shortTripId(trip.id),
    serverId: trip.id,
    status: trip.status,
    statusLabel: STATUS_LABEL[trip.status] ?? trip.status,
    from: PICKUP.name,
    to: hourly ? `${trip.hourly_package_hours}-hour hire` : nearestDropName(trip.drop),
    skill: trip.required_certification,
    ceiling: trip.speed_ceiling_kmh,
    fare: Math.round(trip.fare_amount ?? trip.estimated_fare ?? 0),
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
          rating: trip.driver.rating ?? 5,
          score: trip.driver.mydriver_score ?? 100,
        }
      : null,
  }
}

export function toVaultRow(trip) {
  const view = toViewTrip(trip)
  const when = trip.completed_at ? new Date(trip.completed_at) : new Date(trip.requested_at)
  return {
    ...view,
    date: when.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
    driverName: view.driver?.name ?? 'Driver',
    certId: `MV-${when.getFullYear()}-${shortTripId(trip.id).slice(4)}`,
  }
}

