/**
 * Driver tiers for the picker.
 *
 * Which tiers exist, what they are called and what they cost all come from the
 * server's rate cards, so a change in the console's Pricing page shows here
 * without an app release. Only the explanatory words below live in the app,
 * and a tier the app has no words for is still listed with its name and price.
 */
const SKILL_COPY = {
  'MD-Standard': {
    tagline: 'Everyday certified',
    description: 'Background-verified professional drivers for daily commutes, school runs and errands.',
  },
  'MD-Auto': {
    tagline: 'Automatic expert',
    description: 'Specialised in automatic, dual-clutch and hybrid or electric cars.',
  },
  'MD-SUV': {
    tagline: 'Large SUVs and 4x4',
    description: 'Certified for 6 and 7-seater SUVs, hill driving, heavy traffic and highways.',
  },
  'MD-Lux': {
    tagline: 'Executive class',
    description: 'Hospitality-trained chauffeurs for luxury sedans.',
  },
  'MD-Night': {
    tagline: 'Outstation and night',
    description: 'Night and long-distance highway specialists, monitored by the Safety Desk.',
  },
}

export function skillsFromRateCards(cards) {
  return (cards ?? []).map((card) => ({
    id: card.skill_id,
    label: card.label,
    rate: card.per_km_rate,
    hourlyRate: card.hourly_rate,
    includedKmPerHour: card.included_km_per_hour,
    ...SKILL_COPY[card.skill_id],
  }))
}
