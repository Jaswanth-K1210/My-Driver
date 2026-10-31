import { PICKUP, START_LOCATIONS, INTERCITY_DESTINATIONS, AIRPORT_LOCATIONS, DROPS } from '../data/mock.js'
import { dropFor, getLocationById } from './booking.js'

/** Short human-facing reference derived from the trip UUID. */
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

/**
 * Adapts a server TripView into the shape the existing screens render, so the
 * UI did not need rewriting around a new field set.
 *
 * `visionMode` comes from local config only — the backend has no dashcam
 * concept at all and never returns one.
 */
// Customers no longer pick a tier, so show its name, never the raw id.
const TIER_LABEL = { 'MD-Standard': 'Standard', 'MD-Auto': 'Auto Spec.', 'MD-SUV': 'SUV', 'MD-Lux': 'Lux', 'MD-Night': 'Night' }
export const tierLabel = (id) => TIER_LABEL[id] ?? String(id ?? '').replace(/^MD-/, '')

export function toViewTrip(trip, config) {
  if (!trip) return null

  const hourly = trip.booking_type === 'HOURLY'
  // Server addresses first so custom/GPS pickups and trip history always show the real address.
  let from = trip.pickup_address || null
  let to = trip.drop_address || null

  if ((!from || !to) && config) {
    if (config.requirement === 'inter_city') {
      const startLocId = config.interCityDetails?.startLocationId || 'start_hitec'
      const startLoc = getLocationById(startLocId) ?? START_LOCATIONS[0]
      if (!from) from = startLoc.name

      const destId = config.interCityDetails?.destinationId || config.interCityDestination || 'vijayawada'
      const dest = getLocationById(destId) ?? INTERCITY_DESTINATIONS[0]
      const days = Math.max(0, config.interCityDetails?.days ?? config.interCityDays ?? 1)
      const hours = Math.max(0, config.interCityDetails?.hours ?? 0)
      let dur = ''
      if (days > 0 && hours > 0) dur = `${days}d ${hours}h`
      else if (days > 0) dur = `${days}d`
      else dur = `${Math.max(4, hours)}h`
      if (!to) to = `${dest.name} (${config.tripType === 'two_way' ? 'Round-trip' : 'One-way'} · ${dur})`
    } else if (config.requirement === 'airport') {
      const airportLoc = AIRPORT_LOCATIONS.find((a) => a.id === config.airportDetails.terminalId) ?? AIRPORT_LOCATIONS[0]
      const dropData = dropFor(config.dropId) || DROPS[0]
      if (config.airportDetails.flow === 'arrival') {
        if (!from) from = airportLoc.name
        if (!to) to = dropData.name
      } else {
        if (!from) from = dropData.name
        if (!to) to = airportLoc.name
      }
    } else if (config.requirement === 'full_time') {
      if (!from) from = config.fullTimeDetails?.locality || 'Locality'
      if (!to) to = `${config.fullTimeDetails?.durationCount} ${config.fullTimeDetails?.durationUnit} contract`
    } else if (config.requirement === 'within_city') {
      const pickupData = getLocationById(config.pickupId) ?? PICKUP
      const dropData = dropFor(config.dropId)
      if (!from) from = pickupData.name
      if (!to && dropData) to = dropData.name
    }
  }

  if (!from) from = PICKUP.name
  if (!to) to = hourly ? `${trip.hourly_package_hours}-hour hire` : 'Destination'
  if (
    (trip.trip_type === 'two_way' || config?.tripType === 'two_way') &&
    !to.includes('Round-trip')
  ) {
    to = `${to} (Round-trip)`
  }

  const specs = trip.vehicle_specs && typeof trip.vehicle_specs === 'object' ? trip.vehicle_specs : null
  const specVehicle = specs
    ? [specs.company, specs.model].filter(Boolean).join(' ').trim() || null
    : null
  // Only a real plate. Transmission and fuel are not a number plate (CR-8):
  // with no plate the card shows none rather than "Manual · Diesel".
  const specPlate = (specs?.plate && String(specs.plate).trim()) || null

  return {
    id: shortTripId(trip.id),
    serverId: trip.id,
    status: trip.status,
    statusLabel: STATUS_LABEL[trip.status] ?? trip.status,
    from,
    to,
    skill: tierLabel(trip.required_certification),
    // Once set, cancelling costs the arrival fee (see Track.jsx).
    arrivedAt: trip.arrived_at ?? null,
    cancellationFee: trip.cancellation_fee ?? null,
    urgent: trip.urgent_fee > 0,
    // Set when the first search found nobody: still searching for up to 30 min.
    needsDriverSince: trip.needs_driver_since ?? null,
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
          name: trip.driver.name || 'Your driver',
          initials: trip.driver.initials || 'MD',
          vehicle: trip.driver.vehicle_model || specVehicle || null,
          plate: trip.driver.vehicle_plate || specPlate || null,
          rating: trip.driver.rating ?? null,
          score: trip.driver.mydriver_score ?? null,
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
