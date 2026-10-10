/**
 * Day-to-day support tools for the operations console: find any trip, look
 * up any customer, see how the business is doing, and manage prices.
 *
 * Read paths that expose a person's details are audited, like every other
 * privacy-relevant read in the console.
 */
import { pool } from '../../db/client.js'
import { hideDemo, hideDemoTrips } from '../../lib/demo.js'
import { badRequest, notFound } from '../../lib/errors.js'
import { redis } from '../../redis/client.js'
import type { Role } from '../auth/otp.js'
import { audit } from '../safety-desk/service.js'

/* ── Trip search ─────────────────────────────────────────────────────────── */

export type TripSearch = {
  q?: string | undefined
  status?: string | undefined
  from?: string | undefined
  to?: string | undefined
  customerId?: string | undefined
  driverId?: string | undefined
  cursor?: string | undefined
  limit: number
}

const encodeCursor = (at: Date, id: string) => Buffer.from(`${at.toISOString()}|${id}`).toString('base64url')
function decodeCursor(c: string): [string, string] {
  const [at, id] = Buffer.from(c, 'base64url').toString('utf8').split('|')
  if (!at || !id) throw badRequest('INVALID_CURSOR', 'The pagination cursor is malformed')
  return [at, id]
}

/**
 * One search box for support: a trip reference (TRP-1A2B3C, as customers see
 * it), a customer or driver name, a phone number, or an address. Filters
 * narrow it; keyset pagination keeps page 500 as cheap as page 1.
 */
export async function searchTrips(s: TripSearch) {
  const params: unknown[] = []
  const where: string[] = []
  // Each condition is written with local placeholders ($1?, $2?) that are
  // renumbered onto the shared parameter list, every occurrence included.
  const add = (sql: string, ...vals: unknown[]) => {
    let out = sql
    vals.forEach((v, i) => {
      params.push(v)
      out = out.split(`$${i + 1}?`).join(`$${params.length}`)
    })
    where.push(out)
  }

  const q = s.q?.trim()
  if (q) {
    const ref = q.match(/^(?:TRP-?)?([0-9a-f]{6,8})$/i)
    const digits = q.replace(/\D/g, '')
    if (ref) add(`t.id::text LIKE $1?`, `${ref[1]!.toLowerCase()}%`)
    else if (digits.length >= 5 && digits.length === q.replace(/[\s+-]/g, '').length) {
      add(`(cu.phone_number LIKE $1? OR du.phone_number LIKE $1?)`, `%${digits}%`)
    } else {
      add(
        `(lower(cu.full_name) LIKE $1? OR lower(du.full_name) LIKE $1?
          OR lower(coalesce(t.pickup_address, '')) LIKE $1? OR lower(coalesce(t.drop_address, '')) LIKE $1?)`,
        `%${q.toLowerCase()}%`,
      )
    }
  }
  if (s.status) add(`t.status = $1?::trip_status`, s.status)
  if (s.from) add(`t.requested_at >= $1?::date`, s.from)
  if (s.to) add(`t.requested_at < ($1?::date + 1)`, s.to)
  if (s.customerId) add(`t.customer_id = $1?`, s.customerId)
  if (s.driverId) add(`t.driver_id = $1?`, s.driverId)
  if (s.cursor) {
    const [at, id] = decodeCursor(s.cursor)
    add(`(t.requested_at, t.id) < ($1?::timestamptz, $2?::uuid)`, at, id)
  }
  params.push(s.limit + 1)

  const { rows } = await pool.query(
    `SELECT t.id, t.status, t.booking_type, t.requirement, t.requested_at, t.completed_at, t.cancelled_at,
            t.pickup_address, t.drop_address,
            t.estimated_fare::float8 AS estimated_fare, t.fare_amount::float8 AS fare_amount,
            t.distance_km::float8 AS distance_km,
            cu.id AS customer_id, cu.full_name AS customer_name, cu.phone_number AS customer_phone,
            du.id AS driver_id, du.full_name AS driver_name,
            p.status AS payment_status,
            (SELECT max(e.level::text) FROM escalations e WHERE e.trip_id = t.id) AS top_escalation
       FROM trips t
       JOIN users cu ON cu.id = t.customer_id
       LEFT JOIN users du ON du.id = t.driver_id
       LEFT JOIN payments p ON p.trip_id = t.id
      WHERE true ${where.length ? 'AND ' + where.join(' AND ') : ''} ${hideDemo('cu.is_demo')}
      ORDER BY t.requested_at DESC, t.id DESC
      LIMIT $${params.length}`,
    params,
  )
  const more = rows.length > s.limit
  const page = more ? rows.slice(0, s.limit) : rows
  const last = page.at(-1)
  return { items: page, next_cursor: more && last ? encodeCursor(new Date(last.requested_at), last.id) : null }
}

/** Everything support needs about one trip, on one screen. */
export async function getTripDetail(tripId: string, actorId: string, actorRole: Role) {
  const { rows } = await pool.query(
    `SELECT t.*, t.estimated_fare::float8 AS estimated_fare, t.fare_amount::float8 AS fare_amount,
            t.platform_fee::float8 AS platform_fee, t.night_fee::float8 AS night_fee,
            t.driver_earnings::float8 AS driver_earnings, t.distance_km::float8 AS distance_km,
            t.estimated_distance_km::float8 AS estimated_distance_km,
            cu.full_name AS customer_name, cu.phone_number AS customer_phone, cu.email AS customer_email,
            du.full_name AS driver_name, du.phone_number AS driver_phone,
            dp.vehicle_model, dp.vehicle_plate, dp.rating::float8 AS driver_rating
       FROM trips t
       JOIN users cu ON cu.id = t.customer_id
       LEFT JOIN users du ON du.id = t.driver_id
       LEFT JOIN driver_profiles dp ON dp.user_id = t.driver_id
      WHERE t.id = $1`,
    [tripId],
  )
  const trip = rows[0]
  if (!trip) throw notFound('TRIP_NOT_FOUND', 'No such trip')
  // Never hand the handshake OTP hash or idempotency key to the console.
  delete trip.pickup_handshake_otp_hash
  delete trip.idempotency_key

  const [events, payment, escalations, rating, inspections, links, checkin] = await Promise.all([
    pool.query(
      `SELECT e.type, e.created_at, e.actor_role, e.payload, u.full_name AS actor_name
         FROM trip_events e LEFT JOIN users u ON u.id = e.actor_id
        WHERE e.trip_id = $1 ORDER BY e.created_at, e.id`,
      [tripId],
    ),
    pool.query(
      `SELECT id, status, provider, provider_order_id, provider_payment_id,
              amount_authorized::float8 AS amount_authorized, amount_captured::float8 AS amount_captured,
              amount_refunded::float8 AS amount_refunded, amount_due::float8 AS amount_due,
              failure_reason, created_at, updated_at
         FROM payments WHERE trip_id = $1`,
      [tripId],
    ),
    pool.query(
      `SELECT id, level, status, reason, opened_at, acknowledged_at, resolved_at, resolution
         FROM escalations WHERE trip_id = $1 ORDER BY opened_at`,
      [tripId],
    ),
    pool.query(`SELECT rating, comment, created_at FROM driver_ratings WHERE trip_id = $1`, [tripId]),
    pool.query(
      `SELECT i.phase, i.completed_at, count(p.id)::int AS photos
         FROM inspections i LEFT JOIN inspection_photos p ON p.inspection_id = i.id
        WHERE i.trip_id = $1 GROUP BY i.id ORDER BY i.phase`,
      [tripId],
    ),
    pool.query(
      `SELECT count(*)::int AS links, coalesce(sum(views), 0)::int AS views FROM guardian_links WHERE trip_id = $1`,
      [tripId],
    ),
    pool.query(`SELECT due_at, called_at, outcome, notes FROM post_trip_checkins WHERE trip_id = $1`, [tripId]),
  ])

  await audit(actorId, actorRole, 'VIEW_TRIP', tripId)
  return {
    trip,
    events: events.rows,
    payment: payment.rows[0] ?? null,
    escalations: escalations.rows,
    rating: rating.rows[0] ?? null,
    inspections: inspections.rows,
    guardian: links.rows[0],
    checkin: checkin.rows[0] ?? null,
  }
}

/* ── Customer lookup ─────────────────────────────────────────────────────── */

export async function searchCustomers(q: string | undefined, limit: number) {
  const term = q?.trim() ? `%${q.trim().toLowerCase()}%` : null
  const digits = q?.replace(/\D/g, '') || null
  const { rows } = await pool.query(
    `SELECT u.id, u.full_name, u.phone_number, u.email, u.created_at, u.is_demo,
            (SELECT count(*) FROM trips t WHERE t.customer_id = u.id)::int AS trips,
            (SELECT max(t.requested_at) FROM trips t WHERE t.customer_id = u.id) AS last_trip_at,
            EXISTS (SELECT 1 FROM kyc_verifications k WHERE k.user_id = u.id AND k.kind = 'PAN' AND k.status = 'VERIFIED')
              AND EXISTS (SELECT 1 FROM kyc_verifications k WHERE k.user_id = u.id AND k.kind = 'AADHAAR' AND k.status = 'VERIFIED')
              AS id_verified
       FROM users u
       JOIN user_roles r ON r.user_id = u.id AND r.role = 'CUSTOMER'
      WHERE ($1::text IS NULL OR lower(coalesce(u.full_name, '')) LIKE $1 OR lower(coalesce(u.email::text, '')) LIKE $1
             OR ($2::text IS NOT NULL AND u.phone_number LIKE '%' || $2 || '%'))
        ${hideDemo('u.is_demo')}
      ORDER BY last_trip_at DESC NULLS LAST, u.created_at DESC
      LIMIT $3`,
    [term, digits, limit],
  )
  return rows
}

export async function getCustomer(customerId: string, actorId: string, actorRole: Role) {
  const { rows } = await pool.query(
    `SELECT u.id, u.full_name, u.phone_number, u.email, u.created_at, u.is_demo
       FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'CUSTOMER'
      WHERE u.id = $1`,
    [customerId],
  )
  const customer = rows[0]
  if (!customer) throw notFound('CUSTOMER_NOT_FOUND', 'No such customer')

  const [stats, kyc, guardians, vehicles, recent] = await Promise.all([
    pool.query(
      `SELECT count(*)::int AS trips,
              count(*) FILTER (WHERE t.status = 'COMPLETED')::int AS completed,
              count(*) FILTER (WHERE t.status = 'CANCELLED')::int AS cancelled,
              coalesce(sum(p.amount_captured), 0)::float8 AS spent,
              coalesce(sum(p.amount_refunded), 0)::float8 AS refunded,
              coalesce(sum(p.amount_due), 0)::float8 AS owed,
              (SELECT count(*) FROM escalations e JOIN trips t2 ON t2.id = e.trip_id WHERE t2.customer_id = $1)::int AS incidents
         FROM trips t LEFT JOIN payments p ON p.trip_id = t.id
        WHERE t.customer_id = $1`,
      [customerId],
    ),
    pool.query(
      `SELECT DISTINCT ON (kind) kind, status, number_last4, verified_at
         FROM kyc_verifications WHERE user_id = $1
        ORDER BY kind, (status = 'VERIFIED') DESC, created_at DESC`,
      [customerId],
    ),
    pool.query(`SELECT name, relation, phone FROM guardian_contacts WHERE user_id = $1 ORDER BY position`, [customerId]),
    pool.query(
      `SELECT company, model, engine_type, transmission, plate, is_default FROM saved_vehicles
        WHERE user_id = $1 ORDER BY is_default DESC, created_at`,
      [customerId],
    ),
    searchTrips({ customerId, limit: 20 }),
  ])

  await audit(actorId, actorRole, 'VIEW_CUSTOMER', customerId)
  return {
    customer,
    stats: stats.rows[0],
    kyc: kyc.rows,
    guardians: guardians.rows,
    vehicles: vehicles.rows,
    recent_trips: recent.items,
  }
}

/* ── Overview dashboard ──────────────────────────────────────────────────── */

/**
 * Daily figures for the last `days` days in IST, plus period totals. Money is
 * what was actually captured (or refunded), not quoted fares.
 */
export async function overview(days: number) {
  const ist = `(t.requested_at AT TIME ZONE 'Asia/Kolkata')::date`
  const since = `(now() AT TIME ZONE 'Asia/Kolkata')::date - ($1::int - 1)`
  const [daily, totals, safety, people] = await Promise.all([
    pool.query(
      `WITH d AS (SELECT generate_series(${since}, (now() AT TIME ZONE 'Asia/Kolkata')::date, '1 day')::date AS day)
       SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
              count(t.id) FILTER (WHERE t.status = 'COMPLETED')::int AS completed,
              count(t.id) FILTER (WHERE t.status = 'CANCELLED')::int AS cancelled,
              count(t.id) FILTER (WHERE t.status = 'NO_DRIVERS_FOUND')::int AS no_driver,
              coalesce(sum(p.amount_captured - p.amount_refunded), 0)::float8 AS revenue
         FROM d
         LEFT JOIN trips t ON ${ist} = d.day ${hideDemoTrips('t')}
         LEFT JOIN payments p ON p.trip_id = t.id
        GROUP BY d.day ORDER BY d.day`,
      [days],
    ),
    pool.query(
      `SELECT count(*)::int AS requested,
              count(*) FILTER (WHERE t.status = 'COMPLETED')::int AS completed,
              count(*) FILTER (WHERE t.status = 'CANCELLED')::int AS cancelled,
              count(*) FILTER (WHERE t.status = 'NO_DRIVERS_FOUND')::int AS no_driver,
              coalesce(sum(p.amount_captured - p.amount_refunded), 0)::float8 AS revenue,
              coalesce(sum(t.platform_fee) FILTER (WHERE t.status = 'COMPLETED'), 0)::float8 AS platform_fees,
              coalesce(avg(t.fare_amount) FILTER (WHERE t.status = 'COMPLETED'), 0)::float8 AS avg_fare,
              (SELECT avg(r.rating)::float8 FROM driver_ratings r JOIN trips t2 ON t2.id = r.trip_id
                WHERE ${ist.replace(/t\./g, 't2.')} >= ${since} ${hideDemoTrips('t2')}) AS avg_rating
         FROM trips t LEFT JOIN payments p ON p.trip_id = t.id
        WHERE ${ist} >= ${since} ${hideDemoTrips('t')}`,
      [days],
    ),
    pool.query(
      `SELECT count(*)::int AS escalations,
              count(*) FILTER (WHERE e.level IN ('L4', 'L5'))::int AS emergencies,
              avg(extract(epoch FROM e.acknowledged_at - e.opened_at) / 60)::float8 AS avg_ack_minutes,
              count(*) FILTER (WHERE e.acknowledged_at > e.sla_deadline
                                 OR (e.acknowledged_at IS NULL AND e.sla_deadline < now()))::int AS sla_breaches
         FROM escalations e JOIN trips t ON t.id = e.trip_id
        WHERE (e.opened_at AT TIME ZONE 'Asia/Kolkata')::date >= ${since} ${hideDemoTrips('t')}`,
      [days],
    ),
    pool.query(
      `SELECT (SELECT count(*) FROM users u JOIN user_roles r ON r.user_id = u.id AND r.role = 'CUSTOMER'
                WHERE (u.created_at AT TIME ZONE 'Asia/Kolkata')::date >= ${since} ${hideDemo('u.is_demo')})::int AS new_customers,
              (SELECT count(DISTINCT t.driver_id) FROM trips t
                WHERE t.status = 'COMPLETED' AND ${ist} >= ${since} ${hideDemoTrips('t')})::int AS active_drivers,
              (SELECT count(*) FROM driver_profiles dp JOIN users u ON u.id = dp.user_id
                WHERE dp.onboarding_status = 'UNDER_REVIEW' ${hideDemo('u.is_demo')})::int AS awaiting_review`,
      [days],
    ),
  ])
  return { days, daily: daily.rows, totals: totals.rows[0], safety: safety.rows[0], people: people.rows[0] }
}

/* ── Pricing ─────────────────────────────────────────────────────────────── */

export async function listAllRateCards() {
  const { rows } = await pool.query(
    `SELECT skill_id, label, per_km_rate::float8 AS per_km_rate, hourly_rate::float8 AS hourly_rate,
            included_km_per_hour, active
       FROM rate_cards ORDER BY per_km_rate`,
  )
  return rows
}

/**
 * Change one tier's prices. Takes effect on the next quote: the rate-card
 * cache is dropped here rather than left to expire. Audited with before and
 * after, because a price change is a commercial decision someone must own.
 */
export async function updateRateCard(
  skillId: string,
  patch: { per_km_rate?: number | undefined; hourly_rate?: number | undefined; included_km_per_hour?: number | undefined; active?: boolean | undefined; reason?: string | undefined },
  actorId: string,
  actorRole: Role,
) {
  const { rows: before } = await pool.query(
    `SELECT per_km_rate::float8 AS per_km_rate, hourly_rate::float8 AS hourly_rate, included_km_per_hour, active
       FROM rate_cards WHERE skill_id = $1`,
    [skillId],
  )
  if (!before[0]) throw notFound('UNKNOWN_SKILL', `No rate card for ${skillId}`)

  const { rows } = await pool.query(
    `UPDATE rate_cards
        SET per_km_rate = COALESCE($2, per_km_rate),
            hourly_rate = COALESCE($3, hourly_rate),
            included_km_per_hour = COALESCE($4, included_km_per_hour),
            active = COALESCE($5, active)
      WHERE skill_id = $1
      RETURNING skill_id, label, per_km_rate::float8 AS per_km_rate, hourly_rate::float8 AS hourly_rate,
                included_km_per_hour, active`,
    [skillId, patch.per_km_rate ?? null, patch.hourly_rate ?? null, patch.included_km_per_hour ?? null, patch.active ?? null],
  )
  await redis.del('ratecard:all', `ratecard:${skillId}`)
  await audit(actorId, actorRole, 'RATE_CARD_UPDATED', skillId, { before: before[0], after: rows[0], reason: patch.reason ?? null })
  return rows[0]
}
