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
