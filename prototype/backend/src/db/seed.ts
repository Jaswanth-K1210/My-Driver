import { pool } from './client.js'
import { env } from '../config/env.js'

// Values copied from prototype/website/src/data/mock.js so the backend quotes
// exactly what the marketing site and the apps already advertise.
const RATE_CARDS = [
  { skill_id: 'MD-Standard', label: 'Standard', per_km: 16, hourly: 240 },
  { skill_id: 'MD-Auto', label: 'Auto', per_km: 12, hourly: 180 },
  { skill_id: 'MD-SUV', label: 'SUV', per_km: 22, hourly: 330 },
  { skill_id: 'MD-Lux', label: 'Lux', per_km: 35, hourly: 520 },
  { skill_id: 'MD-Night', label: 'Night', per_km: 19, hourly: 280 },
]

// The tests a driver sits before registration. Codes are versioned because
// editing a live test invalidates every past score: a changed test is a new
// test, never an edit.
const ASSESSMENTS = [
  { code: 'MD-ROAD-RULES-V1', title: 'Road rules & signage', kind: 'WRITTEN', pass: 80, validity: null },
  { code: 'MD-DEFENSIVE-V1', title: 'Defensive driving', kind: 'WRITTEN', pass: 75, validity: null },
  { code: 'MD-PRACTICAL-V1', title: 'On-road practical evaluation', kind: 'PRACTICAL', pass: 80, validity: null },
  { code: 'MD-SUV-HANDLING-V1', title: 'SUV handling', kind: 'PRACTICAL', pass: 80, validity: null },
  { code: 'MD-LUX-ETIQUETTE-V1', title: 'Luxury vehicle care & etiquette', kind: 'PRACTICAL', pass: 85, validity: null },
  // Night Shield is re-verified every 90 days, so its assessment expires.
  { code: 'MD-NIGHT-PROTOCOL-V1', title: 'Night Shield protocol', kind: 'WRITTEN', pass: 90, validity: 90 },
  { code: 'MD-REACTION-V1', title: 'Reaction time baseline', kind: 'REACTION', pass: 70, validity: 90 },
]

// A badge is an authorisation, not a decoration: grants_skill is what puts the
// skill into driver_profiles.certifications, which is what lets dispatch offer
// that class of trip.
const BADGES = [
  { code: 'MD-Standard', label: 'Standard Certified', skill: 'MD-Standard',
    requires: ['MD-ROAD-RULES-V1', 'MD-DEFENSIVE-V1', 'MD-PRACTICAL-V1'], validity: null,
    description: 'Cleared road rules, defensive driving and the on-road practical.' },
  { code: 'MD-Auto', label: 'Auto Certified', skill: 'MD-Auto',
    requires: ['MD-ROAD-RULES-V1', 'MD-PRACTICAL-V1'], validity: null,
    description: 'Cleared road rules and the on-road practical.' },
  { code: 'MD-SUV', label: 'SUV Certified', skill: 'MD-SUV',
    requires: ['MD-ROAD-RULES-V1', 'MD-DEFENSIVE-V1', 'MD-SUV-HANDLING-V1'], validity: null,
    description: 'Cleared SUV handling on top of the standard requirements.' },
  { code: 'MD-Lux', label: 'Luxury Certified', skill: 'MD-Lux',
    requires: ['MD-ROAD-RULES-V1', 'MD-DEFENSIVE-V1', 'MD-LUX-ETIQUETTE-V1'], validity: null,
    description: 'Cleared luxury vehicle care and client etiquette.' },
  { code: 'MD-Night', label: 'Night Shield Certified', skill: 'MD-Night',
    requires: ['MD-NIGHT-PROTOCOL-V1', 'MD-REACTION-V1'], validity: 90,
    description: 'Night Shield protocol. Requires 6+ months tenure and score 85+. Re-verified every 90 days.' },
]

export async function seed(): Promise<void> {
  for (const c of RATE_CARDS) {
    await pool.query(
      `INSERT INTO rate_cards (skill_id, label, per_km_rate, hourly_rate)
       VALUES ($1, $2, $3, $4)
       -- Prices are owned by the console (Pricing) once a tier exists:
       -- re-seeding refreshes the label but never overwrites a price.
       ON CONFLICT (skill_id) DO UPDATE
         SET label = EXCLUDED.label`,
      [c.skill_id, c.label, c.per_km, c.hourly],
    )
  }

  for (const a of ASSESSMENTS) {
    await pool.query(
      `INSERT INTO assessments (code, title, kind, passing_score, validity_days)
       VALUES ($1, $2, $3::assessment_kind, $4, $5)
       ON CONFLICT (code) DO UPDATE
         SET title = EXCLUDED.title,
             passing_score = EXCLUDED.passing_score,
             validity_days = EXCLUDED.validity_days`,
      [a.code, a.title, a.kind, a.pass, a.validity],
    )
  }

  for (const b of BADGES) {
    await pool.query(
      `INSERT INTO badges (code, label, description, grants_skill, requires, validity_days)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (code) DO UPDATE
         SET label = EXCLUDED.label,
             description = EXCLUDED.description,
             grants_skill = EXCLUDED.grants_skill,
             requires = EXCLUDED.requires,
             validity_days = EXCLUDED.validity_days`,
      [b.code, b.label, b.description, b.skill, b.requires, b.validity],
    )
  }

  if (env.NODE_ENV !== 'test') {
    console.log(
      `seeded ${RATE_CARDS.length} rate cards, ${ASSESSMENTS.length} assessments, ${BADGES.length} badges`,
    )
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await seed()
  await pool.end()
}
