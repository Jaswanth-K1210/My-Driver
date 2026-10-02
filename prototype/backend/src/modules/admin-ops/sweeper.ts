import { pool } from '../../db/client.js'
import { counter } from '../../lib/metrics.js'

/**
 * Expires lapsed Night Shield qualifications and badges.
 *
 * The 90-day re-verification rule and every badge expiry date are inert
 * without this: the rows carry an expires_at that nothing acts on, so a
 * driver whose qualification lapsed would keep receiving night trips.
 *
 * Both projections are rewritten from their ledgers rather than patched, so a
 * drift between ledger and projection self-corrects on the next pass.
 */
export async function expireQualifications(): Promise<{ night: number; badges: number }> {
  // Night Shield: clear the dispatch flag for anyone whose live qualification
  // has passed its expiry.
  const night = await pool.query(
    `UPDATE driver_profiles dp
        SET night_shield_certified = false, updated_at = now()
      WHERE dp.night_shield_certified
        AND NOT EXISTS (
          SELECT 1 FROM night_shield_quals q
           WHERE q.driver_id = dp.user_id
             AND q.revoked_at IS NULL
             AND q.expires_at > now()
        )`,
  )

  // Badges: rebuild certifications for any driver holding an expired award.
  const badges = await pool.query(
    `UPDATE driver_profiles dp
        SET certifications = COALESCE((
              SELECT array_agg(DISTINCT b.grants_skill)
                FROM driver_badges db
                JOIN badges b ON b.code = db.badge_code
               WHERE db.driver_id = dp.user_id
                 AND db.revoked_at IS NULL
                 AND (db.expires_at IS NULL OR db.expires_at > now())
                 AND b.grants_skill IS NOT NULL
            ), ARRAY[]::text[]),
            updated_at = now()
      WHERE EXISTS (
        SELECT 1 FROM driver_badges db
         WHERE db.driver_id = dp.user_id
           AND db.revoked_at IS NULL
           AND db.expires_at IS NOT NULL
           AND db.expires_at <= now()
           AND EXISTS (
             SELECT 1 FROM badges b
              WHERE b.code = db.badge_code AND b.grants_skill = ANY(dp.certifications)
           )
      )`,
  )

  // Documents: a lapsed licence is not a verified licence.
  await pool.query(
    `UPDATE driver_documents
        SET status = 'EXPIRED'
      WHERE status = 'VERIFIED' AND expires_on IS NOT NULL AND expires_on < CURRENT_DATE`,
  )

  if (night.rowCount) counter('mydriver_night_shield_expired_total', night.rowCount)
  if (badges.rowCount) counter('mydriver_badges_expired_total', badges.rowCount)

  return { night: night.rowCount ?? 0, badges: badges.rowCount ?? 0 }
}

/**
 * Hourly is ample: these are day-scale expiries, not second-scale ones, and
 * the queries are full-table updates that should not run more often than they
 * need to.
 */
export function startQualificationSweeper(intervalMs = 3_600_000): () => void {
  const timer = setInterval(() => {
    void expireQualifications().catch((err) => console.error('qualification sweeper failed', err))
  }, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}
