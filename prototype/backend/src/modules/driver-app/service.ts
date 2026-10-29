import { pool } from '../../db/client.js'
import { conflict, notFound } from '../../lib/errors.js'
import { earnedAt, earningTrip } from '../trips/earning.js'

/**
 * Read-only views for the driver app's own screens: earnings, assessments and
 * profile. Everything here is scoped to the signed-in driver; the console has
 * its own, wider versions in admin-ops.
 */

// IST midnight today and Monday 00:00 IST this week, as timestamptz. The
// trailing AT TIME ZONE matters: see getDriverSummary in trips/service.ts.
const IST_DAY = `(date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')`
const IST_WEEK = `(date_trunc('week', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')`

export async function getDriverEarnings(driverId: string) {
  const totals = await pool.query<{
    today: number; today_trips: number; week: number; week_trips: number; unsettled: number; unsettled_trips: number
  }>(
    `SELECT
       COALESCE(sum(driver_earnings) FILTER (WHERE ${earnedAt()} >= ${IST_DAY}), 0)::float8  AS today,
       (count(*) FILTER (WHERE ${earnedAt()} >= ${IST_DAY}))::int                            AS today_trips,
       COALESCE(sum(driver_earnings) FILTER (WHERE ${earnedAt()} >= ${IST_WEEK}), 0)::float8 AS week,
       (count(*) FILTER (WHERE ${earnedAt()} >= ${IST_WEEK}))::int                           AS week_trips,
       COALESCE(sum(driver_earnings) FILTER (WHERE payout_id IS NULL), 0)::float8           AS unsettled,
       (count(*) FILTER (WHERE payout_id IS NULL))::int                                     AS unsettled_trips
     FROM trips
     WHERE driver_id = $1 AND ${earningTrip()}`,
    [driverId],
  )

  // One row per IST day for the last 7 days, including days with no trips.
  const daily = await pool.query<{ date: string; trips: number; earnings: number }>(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
            count(t.id)::int AS trips,
            COALESCE(sum(t.driver_earnings), 0)::float8 AS earnings
       FROM generate_series(
              (now() AT TIME ZONE 'Asia/Kolkata')::date - 6,
              (now() AT TIME ZONE 'Asia/Kolkata')::date,
              interval '1 day') AS d(day)
       LEFT JOIN trips t
         ON t.driver_id = $1 AND ${earningTrip('t.')}
        AND (${earnedAt('t.')} AT TIME ZONE 'Asia/Kolkata')::date = d.day::date
      GROUP BY d.day ORDER BY d.day`,
    [driverId],
  )

  const trips = await pool.query(
    `SELECT t.id AS trip_id, ${earnedAt('t.')} AS completed_at, t.cancellation_fee::float8 AS cancellation_fee, t.pickup_address, t.drop_address,
            t.booking_type, t.hourly_package_hours, t.required_certification,
            t.distance_km::float8 AS distance_km, t.duration_min,
            t.fare_amount::float8 AS fare_amount,
            t.platform_fee::float8 AS platform_fee,
            t.night_fee::float8 AS night_fee,
            ROUND((COALESCE(t.fare_amount, 0) - COALESCE(t.platform_fee, 0) - COALESCE(t.night_fee, 0))::numeric, 2)::float8 AS base_fare,
            t.driver_earnings::float8 AS driver_earnings,
            t.requirement, t.trip_type,
            cu.full_name AS customer_name,
            p.status AS payout_status,
            p.reference AS payout_reference
       FROM trips t
       LEFT JOIN users cu ON cu.id = t.customer_id
       LEFT JOIN driver_payouts p ON p.id = t.payout_id
      WHERE t.driver_id = $1 AND ${earningTrip('t.')}
      ORDER BY ${earnedAt('t.')} DESC
      LIMIT 50`,
    [driverId],
  )

  const payouts = await pool.query(
    `SELECT id, to_char(period_start, 'YYYY-MM-DD') AS period_start,
            to_char(period_end, 'YYYY-MM-DD') AS period_end, trip_count,
            gross::float8 AS gross, platform_fee::float8 AS platform_fee, net::float8 AS net,
            status, reference, paid_at
       FROM driver_payouts
      WHERE driver_id = $1
      ORDER BY period_end DESC, created_at DESC
      LIMIT 26`,
    [driverId],
  )

  const t = totals.rows[0]!
  return {
    today: { earnings: t.today, trips: t.today_trips },
    this_week: { earnings: t.week, trips: t.week_trips },
    unsettled: { earnings: t.unsettled, trips: t.unsettled_trips },
    daily: daily.rows,
    trips: trips.rows,
    payouts: payouts.rows,
  }
}

export type AssessmentState = 'NOT_STARTED' | 'SCHEDULED' | 'IN_PROGRESS' | 'AWAITING_RESULT' | 'PASSED' | 'FAILED'

/**
 * Every active test with where this driver stands on it. Questions are never
 * returned: this is a status view, not the test itself.
 */
export async function getDriverAssessments(driverId: string) {
  const { rows } = await pool.query<{
    code: string; title: string; passing_score: number; max_attempts: number
    kind: 'WRITTEN' | 'PRACTICAL' | 'LIVENESS' | 'REACTION' | 'DOCUMENT_REVIEW'
    cooldown_hours: number; attempts_used: number; ever_passed: boolean
    score: number | null; passed: boolean | null; started_at: Date | null; submitted_at: Date | null
    scheduled_at: Date | null; notes: string | null
  }>(
    `SELECT a.code, a.title, a.kind, a.passing_score, a.max_attempts, a.cooldown_hours,
            COALESCE(n.attempts_used, 0)::int AS attempts_used,
            COALESCE(n.ever_passed, false)    AS ever_passed,
            l.score, l.passed, l.started_at, l.submitted_at, l.scheduled_at, l.notes
       FROM assessments a
       LEFT JOIN LATERAL (
         SELECT count(*) AS attempts_used, bool_or(passed) AS ever_passed
           FROM assessment_attempts WHERE driver_id = $1 AND assessment_id = a.id
       ) n ON true
       LEFT JOIN LATERAL (
         SELECT score, passed, started_at, submitted_at, scheduled_at, notes
           FROM assessment_attempts WHERE driver_id = $1 AND assessment_id = a.id
          ORDER BY attempt_no DESC LIMIT 1
       ) l ON true
      WHERE a.active
      ORDER BY a.kind, a.title`,
    [driverId],
  )

  return rows.map((r) => {
    const state: AssessmentState =
      r.ever_passed ? 'PASSED'
        : r.attempts_used === 0 ? 'NOT_STARTED'
          : r.submitted_at === null && r.passed === null ? (r.scheduled_at ? 'SCHEDULED' : 'IN_PROGRESS')
            : r.passed === null ? 'AWAITING_RESULT'
              : 'FAILED'
    const attemptsLeft = Math.max(0, r.max_attempts - r.attempts_used)
    // A failed attempt can be retried after the cooldown, while attempts remain.
    const retryAt =
      state === 'FAILED' && attemptsLeft > 0 && r.submitted_at
        ? new Date(r.submitted_at.getTime() + r.cooldown_hours * 3_600_000).toISOString()
        : null
    return {
      code: r.code,
      title: r.title,
      kind: r.kind,
      passing_score: r.passing_score,
      state,
      attempts_used: r.attempts_used,
      attempts_left: attemptsLeft,
      last_score: r.score,
      last_submitted_at: r.submitted_at ? r.submitted_at.toISOString() : null,
      // The practical test's date while it is still to happen.
      scheduled_at: state === 'SCHEDULED' && r.scheduled_at ? r.scheduled_at.toISOString() : null,
      retry_at: retryAt,
      examiner_notes: r.notes,
    }
  })
}

export async function getDriverProfile(driverId: string) {
  const { rows } = await pool.query(
    `SELECT u.full_name, u.email, u.phone_number, u.created_at AS joined_at,
            p.vehicle_model, p.vehicle_plate,
            -- D-3: a driver's own vehicle and plate are optional.
            COALESCE(btrim(u.full_name), '') <> '' AS profile_complete,
            p.mydriver_score::float8 AS mydriver_score, p.rating::float8 AS rating,
            p.rating_count, p.total_trips, p.certifications, p.onboarding_status
       FROM driver_profiles p JOIN users u ON u.id = p.user_id
      WHERE p.user_id = $1`,
    [driverId],
  )
  if (!rows[0]) throw notFound('DRIVER_NOT_FOUND', 'No driver profile')

  const badges = await pool.query(
    `SELECT b.code, b.label, b.description, b.grants_skill, d.awarded_at, d.expires_at
       FROM driver_badges d JOIN badges b ON b.code = d.badge_code
      WHERE d.driver_id = $1 AND d.revoked_at IS NULL
      ORDER BY d.awarded_at DESC`,
    [driverId],
  )

  // The newest qualification, live or not, so a lapsed driver sees why.
  const shield = await pool.query<{
    qualified_at: Date; expires_at: Date; revoked_at: Date | null; revoke_reason: string | null
  }>(
    `SELECT qualified_at, expires_at, revoked_at, revoke_reason
       FROM night_shield_quals WHERE driver_id = $1
      ORDER BY qualified_at DESC LIMIT 1`,
    [driverId],
  )
  const q = shield.rows[0]
  const nightShield = !q
    ? { status: 'NOT_QUALIFIED' as const, qualified_at: null, expires_at: null, reason: null }
    : {
        status: q.revoked_at ? ('REVOKED' as const) : q.expires_at.getTime() <= Date.now() ? ('EXPIRED' as const) : ('ACTIVE' as const),
        qualified_at: q.qualified_at.toISOString(),
        expires_at: q.expires_at.toISOString(),
        reason: q.revoke_reason,
      }

  const documents = await pool.query(
    `SELECT DISTINCT ON (kind) id, kind, status, number_last4,
            to_char(expires_on, 'YYYY-MM-DD') AS expires_on, reject_reason
       FROM driver_documents WHERE driver_id = $1
      ORDER BY kind, created_at DESC`,
    [driverId],
  )

  return { ...rows[0], badges: badges.rows, night_shield: nightShield, documents: documents.rows }
}

export type DriverProfilePatch = {
  full_name?: string | undefined
  email?: string | null | undefined
  vehicle_model?: string | null | undefined
  vehicle_plate?: string | null | undefined
}

export async function updateDriverProfile(driverId: string, patch: DriverProfilePatch) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (patch.full_name !== undefined || patch.email !== undefined) {
      const sets: string[] = ['updated_at = now()']
      const vals: unknown[] = [driverId]
      if (patch.full_name !== undefined) {
        vals.push(patch.full_name.trim() || null)
        sets.push(`full_name = $${vals.length}`)
      }
      if (patch.email !== undefined) {
        const cleanEmail = patch.email ? patch.email.trim().toLowerCase() : null
        vals.push(cleanEmail || null)
        sets.push(`email = $${vals.length}`)
      }
      await client.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, vals)
    }

    if (patch.vehicle_model !== undefined || patch.vehicle_plate !== undefined) {
      const sets: string[] = ['updated_at = now()']
      const vals: unknown[] = [driverId]
      if (patch.vehicle_model !== undefined) {
        vals.push(patch.vehicle_model?.trim() || null)
        sets.push(`vehicle_model = $${vals.length}`)
      }
      if (patch.vehicle_plate !== undefined) {
        vals.push(patch.vehicle_plate?.trim().toUpperCase() || null)
        sets.push(`vehicle_plate = $${vals.length}`)
      }
      const { rowCount } = await client.query(
        `UPDATE driver_profiles SET ${sets.join(', ')} WHERE user_id = $1`,
        vals,
      )
      if (rowCount === 0) throw notFound('DRIVER_NOT_FOUND', 'No driver profile')
    }

    await client.query('COMMIT')
  } catch (err: unknown) {
    await client.query('ROLLBACK')
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505') {
      throw conflict('EMAIL_IN_USE', 'This email address is already linked to another account')
    }
    throw err
  } finally {
    client.release()
  }

  return getDriverProfile(driverId)
}
