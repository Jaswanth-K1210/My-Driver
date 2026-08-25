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

export async function seed(): Promise<void> {
  for (const c of RATE_CARDS) {
    await pool.query(
      `INSERT INTO rate_cards (skill_id, label, per_km_rate, hourly_rate)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (skill_id) DO UPDATE
         SET label = EXCLUDED.label,
             per_km_rate = EXCLUDED.per_km_rate,
             hourly_rate = EXCLUDED.hourly_rate`,
      [c.skill_id, c.label, c.per_km, c.hourly],
    )
  }
  if (env.NODE_ENV !== 'test') console.log(`seeded ${RATE_CARDS.length} rate cards`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await seed()
  await pool.end()
}
