import { DROPS, HOUR_PACKAGES, NIGHT_FEE, PLATFORM_FEE, SKILLS } from '../data/mock.js'

export const DEFAULT_CONFIG = {
  mode: 'location', // 'location' | 'hour'
  dropId: null,
  packageId: 'h4',
  skillId: 'MD-Standard',
  ceiling: 60,
  visionMode: 'R',
  pickupTime: 'Now',
}

export function skillFor(skillId) {
  return SKILLS.find((s) => s.id === skillId) ?? SKILLS[0]
}

export function dropFor(dropId) {
  return DROPS.find((d) => d.id === dropId) ?? null
}

export function packageFor(packageId) {
  return HOUR_PACKAGES.find((p) => p.id === packageId) ?? HOUR_PACKAGES[0]
}

/**
 * Single source of truth for fare maths, shared by the landing hero widget and
 * the dashboard booking screen so the two can never drift apart.
 * Returns `null` for `base` when the trip is not yet configured enough to price.
 */
export function quoteFor(config) {
  const skill = skillFor(config.skillId)
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

/** Builds the live-trip object handed to the tracking screen. */
export function buildTrip(config) {
  const quote = quoteFor(config)
  const index = Math.max(SKILLS.findIndex((s) => s.id === config.skillId), 0)
  const drop = dropFor(config.dropId)
  const pkg = packageFor(config.packageId)

  return {
    id: 'TRP-8493',
    mode: config.mode,
    from: 'Cyber Towers, HITEC City',
    to: config.mode === 'hour' ? `${pkg.hours}-hour hire` : (drop?.name ?? 'Destination'),
    distanceKm: quote.distanceKm,
    skill: config.skillId,
    ceiling: config.ceiling,
    visionMode: config.visionMode,
    fare: Math.round(quote.total),
    driverIndex: index,
  }
}
