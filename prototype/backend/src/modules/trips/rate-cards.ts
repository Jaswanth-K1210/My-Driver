import { env } from '../../config/env.js'
import { pool } from '../../db/client.js'
import { notFound } from '../../lib/errors.js'
import { redis } from '../../redis/client.js'

export type RateCard = {
  skill_id: string
  label: string
  per_km_rate: number
  hourly_rate: number
  included_km_per_hour: number
}

const CACHE_TTL_SECONDS = 60

/**
 * Rate cards are read on every quote and every booking but change roughly
 * never. Caching them removes a query from one of the hottest paths.
 *
 * Rates are cast to float8 deliberately: these are *rates*, not amounts of
 * money. All computed money stays DECIMAL in the database.
 */
export async function getRateCard(skillId: string): Promise<RateCard> {
  const key = `ratecard:${skillId}`
  const cached = await redis.get(key)
  if (cached) return JSON.parse(cached) as RateCard

  const { rows } = await pool.query<RateCard>(
    `SELECT skill_id, label,
            per_km_rate::float8 AS per_km_rate,
            hourly_rate::float8 AS hourly_rate,
            included_km_per_hour
       FROM rate_cards WHERE skill_id = $1 AND active = true`,
    [skillId],
  )
  const card = rows[0]
  if (!card) throw notFound('UNKNOWN_SKILL', `No active rate card for ${skillId}`)

  await redis.set(key, JSON.stringify(card), 'EX', CACHE_TTL_SECONDS)
  return card
}

export async function listRateCards(): Promise<RateCard[]> {
  const key = 'ratecard:all'
  const cached = await redis.get(key)
  if (cached) return JSON.parse(cached) as RateCard[]

  const { rows } = await pool.query<RateCard>(
    `SELECT skill_id, label,
            per_km_rate::float8 AS per_km_rate,
            hourly_rate::float8 AS hourly_rate,
            included_km_per_hour
       FROM rate_cards WHERE active = true ORDER BY per_km_rate`,
  )
  await redis.set(key, JSON.stringify(rows), 'EX', CACHE_TTL_SECONDS)
  return rows
}

export async function ensureDriverProfile(userId: string): Promise<void> {
  // New profiles default to PENDING, so a driver cannot be dispatched until
  // ops approves them in the admin portal. That gate is the point of the
  // onboarding flow, but it would make `npm run dev` unusable for anyone
  // testing the driver app locally, so development auto-approves.
  // Test keeps the real default so the gate stays under test.
  const autoApprove = env.NODE_ENV === 'development'
  await pool.query(
    // Night Shield too, or local dispatch silently finds nobody after 22:00 IST.
    `INSERT INTO driver_profiles (user_id, onboarding_status, onboarded_at, night_shield_certified)
     VALUES ($1, COALESCE($2::onboarding_status, 'PENDING'), now(), $2 IS NOT NULL)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, autoApprove ? 'APPROVED' : null],
  )
}
