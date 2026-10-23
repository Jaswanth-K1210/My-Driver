import { pool } from '../../db/client.js'
import { badRequest } from '../../lib/errors.js'
import { audit } from '../safety-desk/service.js'
import type { Role } from '../auth/otp.js'
import { DEFAULT_FEES, type Fees } from './fare.js'

/**
 * The live fees. Read on every quote, booking and completion rather than
 * cached, so a change in the console prices the very next request and every
 * API instance agrees. It is one primary-key row.
 */
export async function getFees(): Promise<Fees> {
  const { rows } = await pool.query<Fees>(
    `SELECT platform_fee::float8 AS platform_fee, night_fee::float8 AS night_fee,
            city_stop_fee::float8 AS city_stop_fee, intercity_stop_fee::float8 AS intercity_stop_fee,
            arrival_cancellation_fee::float8 AS arrival_cancellation_fee
       FROM pricing_fees WHERE id`,
  )
  return rows[0] ?? DEFAULT_FEES
}

/** Audited with before and after, like a rate-card change. */
export async function updateFees(
  patch: Partial<Fees> & { reason?: string | undefined },
  actorId: string,
  actorRole: Role,
): Promise<Fees> {
  const before = await getFees()
  const { reason, ...fields } = patch
  if (Object.values(fields).every((v) => v === undefined)) throw badRequest('NOTHING_TO_UPDATE', 'Send at least one fee')
  // Upsert: the row is seeded by the migration, but must not be assumed.
  await pool.query(
    `INSERT INTO pricing_fees (id, platform_fee, night_fee, city_stop_fee, intercity_stop_fee, arrival_cancellation_fee)
     VALUES (true, $1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE
        SET platform_fee = EXCLUDED.platform_fee, night_fee = EXCLUDED.night_fee,
            city_stop_fee = EXCLUDED.city_stop_fee, intercity_stop_fee = EXCLUDED.intercity_stop_fee,
            arrival_cancellation_fee = EXCLUDED.arrival_cancellation_fee,
            updated_at = now()`,
    [
      fields.platform_fee ?? before.platform_fee,
      fields.night_fee ?? before.night_fee,
      fields.city_stop_fee ?? before.city_stop_fee,
      fields.intercity_stop_fee ?? before.intercity_stop_fee,
      fields.arrival_cancellation_fee ?? before.arrival_cancellation_fee,
    ],
  )
  const after = await getFees()
  await audit(actorId, actorRole, 'PRICING_FEES_UPDATED', 'fees', { before, after, reason: reason ?? null })
  return after
}
