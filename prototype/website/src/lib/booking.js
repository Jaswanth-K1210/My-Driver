import { DROPS, HOUR_PACKAGES, NIGHT_FEE, PICKUP, PLATFORM_FEE, SKILLS } from '../data/mock.js'

export const DEFAULT_CONFIG = {
  mode: 'location', // 'location' | 'hour'
  dropId: null,
  packageId: 'h4',
  skillId: 'MD-Standard',
  ceiling: 60,
  visionMode: 'R', // Demo only — never sent to the API. See bookingPayloadFor.
  pickupTime: 'Now',
}

export function skillFor(skillId, skills = SKILLS) {
  return skills.find((s) => s.id === skillId) ?? skills[0]
}

export function dropFor(dropId) {
  return DROPS.find((d) => d.id === dropId) ?? null
}

export function packageFor(packageId) {
  return HOUR_PACKAGES.find((p) => p.id === packageId) ?? HOUR_PACKAGES[0]
}

const HOURS_BY_PACKAGE = { h2: 2, h4: 4, h8: 8, h12: 12 }

/**
 * Local fare estimate, shown instantly while typing. The authoritative number
 * comes from the server (POST /v1/trips/quote) and is what the trip is booked
 * at; this exists so the UI is not blank waiting on a round trip.
 *
 * `skills` carries live rates from GET /v1/rate-cards when available.
 */
export function quoteFor(config, skills = SKILLS) {
  const skill = skillFor(config.skillId, skills)
  const nightFee = config.skillId === 'MD-Night' ? NIGHT_FEE : 0

  if (config.mode === 'hour') {
    const pkg = packageFor(config.packageId)
    const base = pkg.hours * skill.hourlyRate
    return {
      skill,
      nightFee,
      ready: true,
      lines: [
        { label: 'Package', value: `${pkg.hours} hrs · ${pkg.includedKm} km` },
        { label: `${skill.id} hourly`, value: `₹${skill.hourlyRate}/hr` },
      ],
      base,
      total: base + PLATFORM_FEE + nightFee,
      distanceKm: pkg.includedKm,
    }
  }

  const drop = dropFor(config.dropId)
  if (!drop) {
    return { skill, nightFee, ready: false, lines: [], base: 0, total: 0, distanceKm: 0 }
  }

  const base = drop.distanceKm * skill.rate
  return {
    skill,
    nightFee,
    ready: true,
    lines: [
      { label: 'Trip distance', value: `${drop.distanceKm} km` },
      { label: `${skill.id} rate`, value: `₹${skill.rate}/km` },
    ],
    base,
    total: base + PLATFORM_FEE + nightFee,
    distanceKm: drop.distanceKm,
  }
}

/**
 * Turns the UI config into the exact body POST /v1/trips/book accepts.
 *
 * `visionMode` and `pickupTime` are deliberately NOT included. The backend has
 * zero dashcam awareness and rejects an unknown field outright, so sending
 * `mode` would fail the whole booking rather than being ignored.
 */
export function bookingPayloadFor(config, skills = SKILLS) {
  const skill = skillFor(config.skillId, skills)
  const pickup = { lat: PICKUP.lat, lng: PICKUP.lng }

  if (config.mode === 'hour') {
    return {
      booking_type: 'HOURLY',
      hours: HOURS_BY_PACKAGE[config.packageId] ?? 4,
      pickup,
      pickup_address: PICKUP.address,
      required_certification: skill.id,
      speed_ceiling_kmh: config.ceiling,
    }
  }

  const drop = dropFor(config.dropId)
  if (!drop) throw new Error('Choose a destination before booking')

  return {
    booking_type: 'POINT_TO_POINT',
    pickup,
    pickup_address: PICKUP.address,
    drop: { lat: drop.lat, lng: drop.lng },
    drop_address: drop.address,
    required_certification: skill.id,
    speed_ceiling_kmh: config.ceiling,
  }
}

/** Server quote for the current config. Falls back to the local estimate. */
export async function serverQuote(api, config, skills = SKILLS) {
  const payload = bookingPayloadFor(config, skills)
  // The quote endpoint takes the same shape minus the speed ceiling.
  // The quote endpoint takes the booking shape minus the speed ceiling.
  const quoteBody = { ...payload }
  delete quoteBody.speed_ceiling_kmh
  return api.trips.quote(quoteBody)
}
