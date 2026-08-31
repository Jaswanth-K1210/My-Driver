import { PICKUP, START_LOCATIONS, INTERCITY_DESTINATIONS, AIRPORT_LOCATIONS, DROPS } from '../data/mock.js'
import { dropFor } from './booking.js'

/** Short human-facing reference derived from the trip UUID. */
export const shortTripId = (id) => `TRP-${String(id).replace(/-/g, '').slice(0, 6).toUpperCase()}`

const STATUS_LABEL = {
  REQUESTED: 'Finding a driver',
  MATCHED: 'Driver offered — awaiting acceptance',
  HANDSHAKE_PENDING: 'Driver arriving — verify at the vehicle',
  IN_TRIP: 'On the way',
  COMPLETED: 'Trip complete',
  CANCELLED: 'Trip cancelled',
  NO_DRIVERS_FOUND: 'No drivers available',
  ESCALATED: 'Safety Desk engaged',
}

/**
 * Adapts a server TripView into the shape the existing screens render, so the
 * UI did not need rewriting around a new field set.
 *
 * `visionMode` comes from local config only — the backend has no dashcam
 * concept at all and never returns one.
 */
export function toViewTrip(trip, config) {
  if (!trip) return null

    const hourly = trip.booking_type === 'HOURLY'
    let from = PICKUP.name
    let to = hourly ? `${trip.hourly_package_hours}-hour hire` : 'Destination'

    if (config) {
      if (config.requirement === 'inter_city') {
        const startLocId = config.interCityDetails?.startLocationId || 'start_hitec'
        const startLoc = START_LOCATIONS.find((s) => s.id === startLocId) ?? START_LOCATIONS[0]
        from = startLoc.name

        const destId = config.interCityDetails?.destinationId || config.interCityDestination || 'vijayawada'
        const dest = INTERCITY_DESTINATIONS.find((d) => d.id === destId) ?? INTERCITY_DESTINATIONS[0]
        const days = Math.max(0, config.interCityDetails?.days ?? config.interCityDays ?? 1)
        const hours = Math.max(0, config.interCityDetails?.hours ?? 0)
        let dur = ''
        if (days > 0 && hours > 0) dur = `${days}d ${hours}h`
        else if (days > 0) dur = `${days}d`
        else dur = `${Math.max(4, hours)}h`
        to = `${dest.name} (${config.tripType === 'two_way' ? 'Round-trip' : 'One-way'} · ${dur})`
      } else if (config.requirement === 'airport') {
        const airportLoc = AIRPORT_LOCATIONS.find((a) => a.id === config.airportDetails.terminalId) ?? AIRPORT_LOCATIONS[0]
        const dropData = dropFor(config.dropId) || DROPS[0]
        if (config.airportDetails.flow === 'arrival') {
          from = airportLoc.name
          to = dropData.name
        } else {
          from = dropData.name
          to = airportLoc.name
        }
      } else if (config.requirement === 'full_time') {
        from = config.fullTimeDetails?.locality || 'Locality'
        to = `${config.fullTimeDetails?.durationCount} ${config.fullTimeDetails?.durationUnit} contract`
      } else if (config.requirement === 'within_city') {
        const dropData = dropFor(config.dropId)
        if (dropData) to = dropData.name
        if (config.tripType === 'two_way') to += ' (Round-trip)'
      }
    }

  return {
    id: shortTripId(trip.id),
    serverId: trip.id,
    status: trip.status,
    statusLabel: STATUS_LABEL[trip.status] ?? trip.status,
    from,
    to,
    skill: trip.required_certification,
    ceiling: trip.speed_ceiling_kmh,
    visionMode: config?.visionMode ?? 'R',
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
          trips: null,
        }
      : null,
  }
}

/** Vault rows for the history list. */
export function toVaultRow(trip) {
  const view = toViewTrip(trip)
  const when = trip.completed_at ? new Date(trip.completed_at) : new Date(trip.requested_at)
  return {
    ...view,
    date: when.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
    driverName: view.driver?.name ?? 'Driver',
    certId: `MV-${when.getFullYear()}-${shortTripId(trip.id).slice(4)}`,
  }
}
