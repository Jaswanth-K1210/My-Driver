export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function formatINR(amount) {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`
}

export function maskPhone(phone) {
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length < 4) return phone
  return `+91 ${digits.slice(0, 2)}•••• ••${digits.slice(-2)}`
}

/** Display text for a place: only a non-empty string, never a {lat,lng} object. */
export function placeText(...candidates) {
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

/** A {lat,lng} point with finite numbers, or null. */
export function placeCoords(...candidates) {
  for (const value of candidates) {
    if (value && typeof value === 'object' && Number.isFinite(value.lat) && Number.isFinite(value.lng)) {
      return value
    }
  }
  return null
}

const ROUND_TRIP_TYPES = ['two_way', 'round_trip']

/**
 * Tags for the offer card from the offer's car, requirement, trip type and
 * stops. Clients send `within_city` / `two_way`; older or other clients may
 * send `AIRPORT` / `ROUND_TRIP`, so compare case-insensitively and skip blanks.
 */
export function offerTags(offer) {
  if (!offer) return []
  const tags = []
  const car = offer.vehicleSpecs
  if (car && typeof car === 'object') {
    const name = placeText([car.company, car.model].filter((v) => typeof v === 'string' && v.trim()).join(' '))
    if (name) tags.push({ label: name })
    const transmission = placeText(car.transmission)
    if (transmission) tags.push({ label: titleCase(transmission) })
  }
  const requirement = typeof offer.requirement === 'string' ? offer.requirement.toLowerCase() : null
  const flight = placeText(offer.flightNumber)
  if (requirement === 'airport' && flight) tags.push({ label: `Flight ${flight}`, tone: 'brand' })
  const tripType = typeof offer.tripType === 'string' ? offer.tripType.toLowerCase() : null
  if (ROUND_TRIP_TYPES.includes(tripType)) tags.push({ label: 'Round Trip', tone: 'brand' })
  const stops = Array.isArray(offer.stops) ? offer.stops.length : 0
  if (stops > 0) tags.push({ label: `${stops} Stop${stops > 1 ? 's' : ''}` })
  if (requirement) tags.push({ label: titleCase(requirement) })
  return tags
}

function titleCase(value) {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}
