/**
 * Operations and Finance side of the Admin CRM.
 *
 * The Safety Desk half lives in ../safety-desk. This module covers everything
 * that happens away from a live incident: qualifying drivers, verifying their
 * documents, awarding and revoking badges, Night Shield certification, the
 * post-trip check-in queue, and payout reconciliation.
 */
import type { PoolClient } from 'pg'
import { pool } from '../../db/client.js'
import { badRequest, conflict, notFound } from '../../lib/errors.js'
import { getStorageProvider } from '../../providers/storage/index.js'
import type { Role } from '../auth/otp.js'
import { audit } from '../safety-desk/service.js'

export type OnboardingStatus =
  | 'PENDING'
  | 'TESTING'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED'

/* ── Badge projection ─────────────────────────────────────────────────────
 *
 * driver_badges is the authority; driver_profiles.certifications is a
 * denormalised projection of it, because dispatch reads certifications on
 * every matching query (geo-index.ts) and a join there would sit on the hot
 * path. Every writer of driver_badges must call this in the same transaction.
 *
 * ponytail: projection rebuilt in full rather than patched incrementally.
 * It is a handful of rows per driver; if that ever stops being true, switch to
 * an incremental array update.
 */
async function projectCertifications(client: PoolClient, driverId: string): Promise<void> {
  await client.query(
    `UPDATE driver_profiles
        SET certifications = COALESCE((
              SELECT array_agg(DISTINCT b.grants_skill)
                FROM driver_badges db
                JOIN badges b ON b.code = db.badge_code
               WHERE db.driver_id = $1
                 AND db.revoked_at IS NULL
                 AND (db.expires_at IS NULL OR db.expires_at > now())
                 AND b.grants_skill IS NOT NULL
            ), ARRAY[]::text[]),
            updated_at = now()
      WHERE user_id = $1`,
    [driverId],
  )
}

/**
 * Same pattern for Night Shield: night_shield_quals is the ledger,
 * driver_profiles.night_shield_certified is the flag dispatch reads.
 */
async function projectNightShield(client: PoolClient, driverId: string): Promise<void> {
  await client.query(
    `UPDATE driver_profiles
        SET night_shield_certified = EXISTS (
              SELECT 1 FROM night_shield_quals
               WHERE driver_id = $1 AND revoked_at IS NULL AND expires_at > now()
            ),
            updated_at = now()
      WHERE user_id = $1`,
    [driverId],
  )
}

/* ── Driver review ───────────────────────────────────────────────────────── */

export type DriverRow = {
  user_id: string
  full_name: string | null
  phone_number: string | null
  onboarding_status: OnboardingStatus
  mydriver_score: number
  night_shield_certified: boolean
  certifications: string[]
  total_trips: number
  onboarded_at: string | null
  documents_pending: number
  assessments_passed: number
}

export async function listDrivers(
  status: OnboardingStatus | undefined,
  limit: number,
): Promise<DriverRow[]> {
  const { rows } = await pool.query<DriverRow>(
    `SELECT dp.user_id,
            u.full_name,
            u.phone_number,
            dp.onboarding_status,
            dp.mydriver_score::float8 AS mydriver_score,
            dp.night_shield_certified,
            dp.certifications,
            dp.total_trips,
            dp.onboarded_at,
            (SELECT COUNT(*) FROM driver_documents d
              WHERE d.driver_id = dp.user_id AND d.status = 'SUBMITTED')::int
              AS documents_pending,
            (SELECT COUNT(*) FROM assessment_attempts a
              WHERE a.driver_id = dp.user_id AND a.passed = true)::int
              AS assessments_passed
       FROM driver_profiles dp
       JOIN users u ON u.id = dp.user_id
      WHERE ($1::onboarding_status IS NULL OR dp.onboarding_status = $1)
      ORDER BY
        -- Review queue order: anything awaiting a decision first, oldest first.
        CASE dp.onboarding_status
          WHEN 'UNDER_REVIEW' THEN 0 WHEN 'TESTING' THEN 1 WHEN 'PENDING' THEN 2 ELSE 3
        END,
        dp.onboarded_at NULLS LAST
      LIMIT $2`,
    [status ?? null, limit],
  )
  return rows
}

export async function getDriver(driverId: string) {
  const { rows } = await pool.query(
    `SELECT dp.user_id, u.full_name, u.phone_number, u.email,
            dp.onboarding_status, dp.mydriver_score::float8 AS mydriver_score,
            dp.rating::float8 AS rating, dp.rating_count, dp.total_trips,
            dp.certifications, dp.night_shield_certified,
            dp.vehicle_model, dp.vehicle_plate, dp.availability,
            dp.reviewed_by, dp.reviewed_at, dp.review_note, dp.onboarded_at
       FROM driver_profiles dp
       JOIN users u ON u.id = dp.user_id
      WHERE dp.user_id = $1`,
    [driverId],
  )
  const profile = rows[0]
  if (!profile) throw notFound('DRIVER_NOT_FOUND', 'No driver profile for that user')

  const [documents, attempts, badges, nightShield] = await Promise.all([
    pool.query(
      `SELECT id, kind, status, number_last4, expires_on, reject_reason,
              reviewed_by, reviewed_at, created_at
         FROM driver_documents WHERE driver_id = $1 ORDER BY created_at DESC`,
      [driverId],
    ),
    pool.query(
      `SELECT aa.id, aa.attempt_no, aa.score, aa.passed, aa.submitted_at, aa.notes,
              a.code, a.title, a.kind, a.passing_score
         FROM assessment_attempts aa
         JOIN assessments a ON a.id = aa.assessment_id
        WHERE aa.driver_id = $1
        ORDER BY aa.submitted_at DESC NULLS FIRST, aa.started_at DESC`,
      [driverId],
    ),
    pool.query(
      `SELECT db.id, db.badge_code, b.label, b.grants_skill,
              db.awarded_at, db.expires_at, db.revoked_at, db.revoke_reason
         FROM driver_badges db
         JOIN badges b ON b.code = db.badge_code
        WHERE db.driver_id = $1 ORDER BY db.awarded_at DESC`,
      [driverId],
    ),
    pool.query(
      `SELECT id, qualified_at, expires_at, tenure_days_at_check,
              score_at_check::float8 AS score_at_check, revoked_at, revoke_reason
         FROM night_shield_quals
        WHERE driver_id = $1 ORDER BY qualified_at DESC`,
      [driverId],
    ),
  ])

  return {
    profile,
    documents: documents.rows,
    attempts: attempts.rows,
    badges: badges.rows,
    night_shield: nightShield.rows,
  }
}

/**
 * Moving a driver between onboarding states. Every transition is audited with
 * the previous state, because "who approved this driver, and what did they see"
 * is the question asked after an incident.
 */
export async function setOnboardingStatus(
  driverId: string,
  status: OnboardingStatus,
  actorId: string,
  actorRole: Role,
  note?: string,
): Promise<{ user_id: string; onboarding_status: OnboardingStatus }> {
  const { rows } = await pool.query<{ onboarding_status: OnboardingStatus }>(
    `SELECT onboarding_status FROM driver_profiles WHERE user_id = $1`,
    [driverId],
  )
  const before = rows[0]
  if (!before) throw notFound('DRIVER_NOT_FOUND', 'No driver profile for that user')

  // Approval is a claim that the paperwork was checked. Refuse to make that
  // claim while a document is still sitting unreviewed.
  if (status === 'APPROVED') {
    const { rows: pending } = await pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM driver_documents WHERE driver_id = $1 AND status = 'SUBMITTED'`,
      [driverId],
    )
    if (Number(pending[0]?.count ?? 0) > 0) {
      throw conflict(
        'DOCUMENTS_PENDING',
        'Every submitted document must be verified or rejected before approval',
        { pending: Number(pending[0]!.count) },
      )
    }
  }

  const { rows: updated } = await pool.query<{
    user_id: string
    onboarding_status: OnboardingStatus
  }>(
    `UPDATE driver_profiles
        SET onboarding_status = $2::onboarding_status,
            reviewed_by = $3, reviewed_at = now(), review_note = $4, updated_at = now()
      WHERE user_id = $1
      RETURNING user_id, onboarding_status`,
    [driverId, status, actorId, note ?? null],
  )

  await audit(actorId, actorRole, `DRIVER_${status}`, driverId, {
    from: before.onboarding_status,
    to: status,
    note: note ?? null,
  })
  return updated[0]!
}

/* ── Documents ───────────────────────────────────────────────────────────── */

export async function documentUrl(
  documentId: string,
  actorId: string,
  actorRole: Role,
): Promise<{ url: string }> {
  const { rows } = await pool.query<{ storage_key: string; driver_id: string; kind: string }>(
    `SELECT storage_key, driver_id, kind FROM driver_documents WHERE id = $1`,
    [documentId],
  )
  const doc = rows[0]
  if (!doc) throw notFound('DOCUMENT_NOT_FOUND', 'No such document')

  // Looking at someone's government ID is a privacy-relevant act, so it is
  // audited exactly like opening a live location feed.
  await audit(actorId, actorRole, 'VIEW_DOCUMENT', doc.driver_id, {
    document_id: documentId,
    kind: doc.kind,
  })

  return { url: await getStorageProvider().signedUrl(doc.storage_key, 300) }
}

export async function reviewDocument(
  documentId: string,
  status: 'VERIFIED' | 'REJECTED',
  actorId: string,
  actorRole: Role,
  rejectReason?: string,
) {
  if (status === 'REJECTED' && !rejectReason) {
    throw badRequest('REASON_REQUIRED', 'A rejection must say why')
  }

  const { rows } = await pool.query(
    `UPDATE driver_documents
        SET status = $2::document_status, reviewed_by = $3, reviewed_at = now(),
            reject_reason = $4
      WHERE id = $1 AND status = 'SUBMITTED'
      RETURNING id, driver_id, kind, status, reject_reason`,
    [documentId, status, actorId, rejectReason ?? null],
  )
  const doc = rows[0]
  if (!doc) {
    throw conflict('DOCUMENT_NOT_PENDING', 'That document is not awaiting review')
  }

  await audit(actorId, actorRole, `DOCUMENT_${status}`, doc.driver_id, {
    document_id: documentId,
    kind: doc.kind,
    reason: rejectReason ?? null,
  })
  return doc
}

/* ── Assessments and badges ──────────────────────────────────────────────── */

export async function listAssessments() {
  const { rows } = await pool.query(
    `SELECT id, code, title, kind, passing_score, max_attempts, cooldown_hours,
            validity_days, active
       FROM assessments WHERE active ORDER BY kind, code`,
  )
  return rows
}

export async function gradingQueue(limit: number) {
  const { rows } = await pool.query(
    `SELECT aa.id, aa.driver_id, u.full_name, aa.attempt_no, aa.answers,
            aa.started_at, aa.submitted_at,
            a.code, a.title, a.kind, a.passing_score
       FROM assessment_attempts aa
       JOIN assessments a ON a.id = aa.assessment_id
       JOIN users u ON u.id = aa.driver_id
      WHERE aa.submitted_at IS NOT NULL AND aa.passed IS NULL
      ORDER BY aa.submitted_at
      LIMIT $1`,
    [limit],
  )
  return rows
}

export async function gradeAttempt(
  attemptId: string,
  score: number,
  actorId: string,
  actorRole: Role,
  notes?: string,
) {
  // passed is derived from the assessment's own threshold rather than taken
  // from the caller: a grader supplies a score, not a verdict.
  const { rows } = await pool.query(
    `UPDATE assessment_attempts aa
        SET score = $2, notes = $3, evaluated_by = $4,
            passed = ($2 >= a.passing_score),
            submitted_at = COALESCE(aa.submitted_at, now())
       FROM assessments a
      WHERE aa.id = $1 AND a.id = aa.assessment_id AND aa.passed IS NULL
      RETURNING aa.id, aa.driver_id, aa.score, aa.passed, a.code, a.passing_score`,
    [attemptId, score, notes ?? null, actorId],
  )
  const attempt = rows[0]
  if (!attempt) throw conflict('ATTEMPT_NOT_GRADABLE', 'That attempt is not awaiting grading')

  await audit(actorId, actorRole, 'ATTEMPT_GRADED', attempt.driver_id, {
    attempt_id: attemptId,
    code: attempt.code,
    score,
    passed: attempt.passed,
  })
  return attempt
}

export async function listBadges() {
  const { rows } = await pool.query(
    `SELECT code, label, description, grants_skill, requires, validity_days
       FROM badges WHERE active ORDER BY code`,
  )
  return rows
}

/**
 * Awarding a badge. The prerequisite check is the point: a badge grants a
 * dispatch privilege, so it may only be issued to a driver who has actually
 * passed every assessment the badge requires.
 */
export async function awardBadge(
  driverId: string,
  badgeCode: string,
  actorId: string,
  actorRole: Role,
) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: badgeRows } = await client.query<{
      code: string
      requires: string[]
      validity_days: number | null
      grants_skill: string | null
    }>(`SELECT code, requires, validity_days, grants_skill FROM badges WHERE code = $1 AND active`, [
      badgeCode,
    ])
    const badge = badgeRows[0]
    if (!badge) throw notFound('BADGE_NOT_FOUND', 'No such badge')

    const { rows: passedRows } = await client.query<{ code: string }>(
      `SELECT DISTINCT a.code
         FROM assessment_attempts aa
         JOIN assessments a ON a.id = aa.assessment_id
        WHERE aa.driver_id = $1 AND aa.passed = true AND a.code = ANY($2::text[])`,
      [driverId, badge.requires],
    )
    const passed = new Set(passedRows.map((r) => r.code))
    const missing = badge.requires.filter((code) => !passed.has(code))
    if (missing.length > 0) {
      throw conflict('ASSESSMENTS_INCOMPLETE', 'The driver has not passed every required test', {
        missing,
      })
    }

    const { rows: awarded } = await client.query(
      `INSERT INTO driver_badges (driver_id, badge_code, awarded_by, expires_at, source_attempt_id)
       VALUES ($1, $2, $3,
               CASE WHEN $4::smallint IS NULL THEN NULL
                    ELSE now() + ($4::smallint * INTERVAL '1 day') END,
               (SELECT aa.id FROM assessment_attempts aa
                  JOIN assessments a ON a.id = aa.assessment_id
                 WHERE aa.driver_id = $1 AND aa.passed = true AND a.code = ANY($5::text[])
                 ORDER BY aa.submitted_at DESC LIMIT 1))
       ON CONFLICT DO NOTHING
       RETURNING id, badge_code, awarded_at, expires_at`,
      [driverId, badgeCode, actorId, badge.validity_days, badge.requires],
    )
    if (!awarded[0]) {
      throw conflict('BADGE_ALREADY_HELD', 'The driver already holds that badge')
    }

    await projectCertifications(client, driverId)
    await client.query('COMMIT')

    await audit(actorId, actorRole, 'BADGE_AWARDED', driverId, {
      badge: badgeCode,
      grants_skill: badge.grants_skill,
    })
    return awarded[0]
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function revokeBadge(
  driverId: string,
  badgeCode: string,
  reason: string,
  actorId: string,
  actorRole: Role,
) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE driver_badges
          SET revoked_at = now(), revoke_reason = $3
        WHERE driver_id = $1 AND badge_code = $2 AND revoked_at IS NULL
        RETURNING id, badge_code, revoked_at`,
      [driverId, badgeCode, reason],
    )
    if (!rows[0]) throw notFound('BADGE_NOT_HELD', 'The driver does not hold that badge')

    await projectCertifications(client, driverId)
    await client.query('COMMIT')

    await audit(actorId, actorRole, 'BADGE_REVOKED', driverId, { badge: badgeCode, reason })
    return rows[0]
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/* ── Night Shield ────────────────────────────────────────────────────────── */

/** Re-verification interval from the Night Shield protocol. */
export const NIGHT_SHIELD_VALIDITY_DAYS = 90
const NIGHT_SHIELD_MIN_TENURE_DAYS = 180
const NIGHT_SHIELD_MIN_SCORE = 85

/**
 * Issue a Night Shield qualification.
 *
 * The 6-month / score-85 rule is enforced by CHECK constraints on the table, so
 * a bad insert fails regardless. It is checked here too so the operator gets a
 * useful message naming which rule failed, rather than a raw constraint error.
 */
export async function qualifyNightShield(driverId: string, actorId: string, actorRole: Role) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows } = await client.query<{ tenure_days: number; score: number }>(
      `SELECT GREATEST(0, EXTRACT(DAY FROM now() - COALESCE(onboarded_at, updated_at)))::int
               AS tenure_days,
             mydriver_score::float8 AS score
        FROM driver_profiles WHERE user_id = $1`,
      [driverId],
    )
    const driver = rows[0]
    if (!driver) throw notFound('DRIVER_NOT_FOUND', 'No driver profile for that user')

    const failures: string[] = []
    if (driver.tenure_days < NIGHT_SHIELD_MIN_TENURE_DAYS) {
      failures.push(`tenure ${driver.tenure_days}d < ${NIGHT_SHIELD_MIN_TENURE_DAYS}d`)
    }
    if (driver.score < NIGHT_SHIELD_MIN_SCORE) {
      failures.push(`score ${driver.score} < ${NIGHT_SHIELD_MIN_SCORE}`)
    }
    if (failures.length > 0) {
      throw conflict('NIGHT_SHIELD_UNQUALIFIED', `Driver does not meet: ${failures.join(', ')}`, {
        failures,
        tenure_days: driver.tenure_days,
        score: driver.score,
      })
    }

    const { rows: qual } = await client.query(
      `INSERT INTO night_shield_quals
         (driver_id, expires_at, tenure_days_at_check, score_at_check, verified_by)
       VALUES ($1, now() + ($2::int * INTERVAL '1 day'), $3, $4, $5)
       RETURNING id, qualified_at, expires_at, tenure_days_at_check,
                 score_at_check::float8 AS score_at_check`,
      [driverId, NIGHT_SHIELD_VALIDITY_DAYS, driver.tenure_days, driver.score, actorId],
    )

    await projectNightShield(client, driverId)
    await client.query('COMMIT')

    await audit(actorId, actorRole, 'NIGHT_SHIELD_QUALIFIED', driverId, qual[0])
    return qual[0]
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function revokeNightShield(
  driverId: string,
  reason: string,
  actorId: string,
  actorRole: Role,
) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE night_shield_quals
          SET revoked_at = now(), revoke_reason = $2
        WHERE driver_id = $1 AND revoked_at IS NULL
        RETURNING id, revoked_at`,
      [driverId, reason],
    )
    if (!rows[0]) throw notFound('NOT_QUALIFIED', 'That driver holds no live Night Shield qualification')

    await projectNightShield(client, driverId)
    await client.query('COMMIT')

    await audit(actorId, actorRole, 'NIGHT_SHIELD_REVOKED', driverId, { reason })
    return rows[0]
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/** Qualifications lapsing within `days`, so ops can re-verify before they do. */
export async function expiringNightShield(days: number) {
  const { rows } = await pool.query(
    `SELECT q.driver_id, u.full_name, u.phone_number, q.qualified_at, q.expires_at,
            EXTRACT(DAY FROM q.expires_at - now())::int AS days_remaining
       FROM night_shield_quals q
       JOIN users u ON u.id = q.driver_id
      WHERE q.revoked_at IS NULL
        AND q.expires_at < now() + ($1::int * INTERVAL '1 day')
      ORDER BY q.expires_at`,
    [days],
  )
  return rows
}

/** Shift-start liveness + reaction results for one operating night. */
export async function shiftChecks(shiftDate: string | undefined) {
  const { rows } = await pool.query(
    `SELECT c.id, c.driver_id, u.full_name, c.shift_date,
            c.liveness_confidence::float8 AS liveness_confidence,
            c.liveness_passed, c.reaction_ms, c.reaction_passed, c.passed, c.created_at
       FROM night_shift_checks c
       JOIN users u ON u.id = c.driver_id
      WHERE c.shift_date = COALESCE($1::date, (now() - INTERVAL '5 hours')::date)
      ORDER BY c.passed, c.created_at DESC`,
    [shiftDate ?? null],
  )
  return rows
}

/* ── Post-trip check-in queue ────────────────────────────────────────────── */

export async function checkinQueue(includeDone: boolean, limit: number) {
  const { rows } = await pool.query(
    `SELECT c.trip_id, c.due_at, c.called_at, c.outcome, c.notes, c.escalation_id,
            cu.full_name AS customer_name, du.full_name AS driver_name,
            t.drop_address, t.completed_at,
            (c.outcome = 'PENDING' AND c.due_at < now()) AS overdue
       FROM post_trip_checkins c
       JOIN trips t ON t.id = c.trip_id
       JOIN users cu ON cu.id = t.customer_id
       LEFT JOIN users du ON du.id = t.driver_id
      WHERE ($1::boolean OR c.outcome = 'PENDING')
      ORDER BY c.outcome <> 'PENDING', c.due_at
      LIMIT $2`,
    [includeDone, limit],
  )
  return rows
}

export async function recordCheckin(
  tripId: string,
  outcome: 'SAFE' | 'NO_ANSWER' | 'NEEDS_FOLLOWUP' | 'ESCALATED',
  actorId: string,
  actorRole: Role,
  notes?: string,
) {
  const { rows } = await pool.query(
    `UPDATE post_trip_checkins
        SET outcome = $2::checkin_outcome, called_at = now(), agent_id = $3, notes = $4
      WHERE trip_id = $1 AND outcome = 'PENDING'
      RETURNING trip_id, outcome, called_at`,
    [tripId, outcome, actorId, notes ?? null],
  )
  if (!rows[0]) throw conflict('CHECKIN_NOT_PENDING', 'That check-in is not pending')

  await audit(actorId, actorRole, 'POST_TRIP_CHECKIN', tripId, { outcome, notes: notes ?? null })
  return rows[0]
}

/* ── Payouts ─────────────────────────────────────────────────────────────── */

export async function listPayouts(status: string | undefined, limit: number) {
  const { rows } = await pool.query(
    `SELECT p.id, p.driver_id, u.full_name AS driver_name, p.period_start, p.period_end,
            p.trip_count, p.gross::float8 AS gross, p.platform_fee::float8 AS platform_fee,
            p.net::float8 AS net, p.status, p.reference, p.approved_by, p.paid_at, p.created_at
       FROM driver_payouts p
       JOIN users u ON u.id = p.driver_id
      WHERE ($1::text IS NULL OR p.status::text = $1)
      ORDER BY p.created_at DESC
      LIMIT $2`,
    [status ?? null, limit],
  )
  return rows
}

/** Completed but unsettled trips, so Finance can see a run before making it. */
export async function unsettled(periodStart: string, periodEnd: string) {
  const { rows } = await pool.query(
    `SELECT t.driver_id, u.full_name AS driver_name, COUNT(*)::int AS trip_count,
            COALESCE(SUM(t.driver_earnings), 0)::float8 AS gross,
            COALESCE(SUM(t.platform_fee), 0)::float8 AS platform_fee
       FROM trips t
       JOIN users u ON u.id = t.driver_id
      WHERE t.status = 'COMPLETED' AND t.payout_id IS NULL
        AND t.completed_at >= $1::date AND t.completed_at < $2::date
      GROUP BY t.driver_id, u.full_name
      ORDER BY gross DESC`,
    [periodStart, periodEnd],
  )
  return rows
}

/**
 * Generate a payout for one driver over one period.
 *
 * Both statements carry `payout_id IS NULL`, which is what makes this
 * idempotent under concurrency: a second run matches zero trips and creates
 * nothing. The UPDATE is what actually prevents double payment — a unique
 * constraint on (driver, period) would not, because two overlapping periods
 * would each legitimately claim the same trip.
 */
export async function generatePayout(
  driverId: string,
  periodStart: string,
  periodEnd: string,
  actorId: string,
  actorRole: Role,
) {
  if (periodEnd <= periodStart) {
    throw badRequest('INVALID_PERIOD', 'period_end must be after period_start')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const { rows: totals } = await client.query<{
      trip_count: number
      gross: string
      platform_fee: string
    }>(
      `SELECT COUNT(*)::int AS trip_count,
              COALESCE(SUM(driver_earnings), 0) AS gross,
              COALESCE(SUM(platform_fee), 0) AS platform_fee
         FROM trips
        WHERE driver_id = $1 AND status = 'COMPLETED' AND payout_id IS NULL
          AND completed_at >= $2::date AND completed_at < $3::date`,
      [driverId, periodStart, periodEnd],
    )
    const total = totals[0]!
    if (total.trip_count === 0) {
      throw conflict('NOTHING_TO_SETTLE', 'No unsettled completed trips in that period')
    }

    const { rows: created } = await client.query<{ id: string }>(
      `INSERT INTO driver_payouts
         (driver_id, period_start, period_end, trip_count, gross, platform_fee, net)
       VALUES ($1, $2::date, $3::date, $4, $5, $6, $5::numeric - $6::numeric)
       RETURNING id`,
      [driverId, periodStart, periodEnd, total.trip_count, total.gross, total.platform_fee],
    )
    const payoutId = created[0]!.id

    const { rowCount } = await client.query(
      `UPDATE trips SET payout_id = $4
        WHERE driver_id = $1 AND status = 'COMPLETED' AND payout_id IS NULL
          AND completed_at >= $2::date AND completed_at < $3::date`,
      [driverId, periodStart, periodEnd, payoutId],
    )

    // The count is recomputed between the two statements only if another
    // transaction settled trips in between. Postgres' read-committed snapshot
    // makes that visible here, so a mismatch means the total is wrong: abort.
    if (rowCount !== total.trip_count) {
      throw conflict('CONCURRENT_SETTLEMENT', 'Those trips were settled by another run')
    }

    await client.query('COMMIT')
    await audit(actorId, actorRole, 'PAYOUT_GENERATED', driverId, {
      payout_id: payoutId,
      trip_count: total.trip_count,
      period: [periodStart, periodEnd],
    })
    return { id: payoutId, trip_count: total.trip_count }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

export async function advancePayout(
  payoutId: string,
  to: 'APPROVED' | 'PAID' | 'FAILED',
  actorId: string,
  actorRole: Role,
  reference?: string,
) {
  // Payouts move PENDING -> APPROVED -> PAID. A separate person approving and
  // paying is the control; the state machine is what makes that enforceable.
  const from = to === 'APPROVED' ? 'PENDING' : to === 'PAID' ? 'APPROVED' : 'PENDING'

  const { rows } = await pool.query(
    `UPDATE driver_payouts
        SET status = $2::payout_status,
            approved_by = CASE WHEN $2 = 'APPROVED' THEN $3 ELSE approved_by END,
            paid_at     = CASE WHEN $2 = 'PAID' THEN now() ELSE paid_at END,
            reference   = COALESCE($4, reference)
      WHERE id = $1 AND status = $5::payout_status
      RETURNING id, driver_id, status, reference, paid_at`,
    [payoutId, to, actorId, reference ?? null, from],
  )
  const payout = rows[0]
  if (!payout) {
    throw conflict('PAYOUT_WRONG_STATE', `A payout can only become ${to} from ${from}`)
  }

  await audit(actorId, actorRole, `PAYOUT_${to}`, payout.driver_id, {
    payout_id: payoutId,
    reference: reference ?? null,
  })
  return payout
}

/* ── Audit ledger ────────────────────────────────────────────────────────── */

export async function auditLog(filters: {
  actor?: string
  subject?: string
  action?: string
  limit: number
}) {
  const { rows } = await pool.query(
    `SELECT a.id, a.actor_id, u.full_name AS actor_name, a.actor_role,
            a.action, a.subject, a.payload, a.created_at
       FROM audit_log a
       LEFT JOIN users u ON u.id = a.actor_id
      WHERE ($1::uuid IS NULL OR a.actor_id = $1)
        AND ($2::text IS NULL OR a.subject = $2)
        AND ($3::text IS NULL OR a.action = $3)
      ORDER BY a.created_at DESC
      LIMIT $4`,
    [filters.actor ?? null, filters.subject ?? null, filters.action ?? null, filters.limit],
  )
  return rows
}
