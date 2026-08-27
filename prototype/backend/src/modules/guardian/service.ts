import { pool } from '../../db/client.js'
import { env } from '../../config/env.js'
import { forbidden, notFound } from '../../lib/errors.js'
import { peppered, randomToken } from '../../lib/hash.js'
import { redis } from '../../redis/client.js'
import { getSmsProvider } from '../../providers/sms/index.js'

/** A link outlives a long trip but not a day. */
export const GUARDIAN_LINK_TTL_SECONDS = 12 * 60 * 60

export type GuardianLink = { url: string; token: string; expires_at: string }

export async function createGuardianLink(
  tripId: string,
  customerId: string,
): Promise<GuardianLink> {
  const { rows } = await pool.query<{ status: string }>(
    `SELECT status FROM trips WHERE id = $1 AND customer_id = $2`,
    [tripId, customerId],
  )
  if (!rows[0]) throw notFound('TRIP_NOT_FOUND', 'No such trip')

  const token = randomToken(24)
  const { rows: created } = await pool.query<{ expires_at: Date }>(
    `INSERT INTO guardian_links (trip_id, token_hash, created_by, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval)
     RETURNING expires_at`,
    [tripId, peppered(token), customerId, String(GUARDIAN_LINK_TTL_SECONDS)],
  )

  return {
    token,
    url: `${env.PUBLIC_WEB_URL}/track/${token}`,
    expires_at: created[0]!.expires_at.toISOString(),
  }
}

export type GuardianView = {
  trip_id: string
  status: string
  coords: { lat: number; lng: number } | null
  speed_kmh: number | null
  speed_ceiling_kmh: number
  over_ceiling: boolean
  driver_first_name: string | null
  vehicle: string | null
  updated_at: string | null
}

/**
 * Public, unauthenticated read.
 *
 * Deliberately narrow: position, speed against the ceiling, status, and the
 * driver's *first name* and vehicle. No phone numbers, no surnames, no fare, no
 * customer details. Someone holding a shared link is not a party to the trip.
 */
export async function resolveGuardianLink(token: string): Promise<GuardianView> {
  const { rows } = await pool.query<{
    id: string
    trip_id: string
    revoked_at: Date | null
    expires_at: Date
    status: string
    speed_ceiling_kmh: number
    driver_name: string | null
    vehicle_model: string | null
  }>(
    `SELECT gl.id, gl.trip_id, gl.revoked_at, gl.expires_at,
            t.status, t.speed_ceiling_kmh,
            du.full_name AS driver_name, dp.vehicle_model
       FROM guardian_links gl
       JOIN trips t ON t.id = gl.trip_id
       LEFT JOIN users du ON du.id = t.driver_id
       LEFT JOIN driver_profiles dp ON dp.user_id = t.driver_id
      WHERE gl.token_hash = $1`,
    [peppered(token)],
  )

  const link = rows[0]
  if (!link) throw notFound('LINK_NOT_FOUND', 'That tracking link is not valid')
  if (link.revoked_at) throw forbidden('LINK_REVOKED', 'That tracking link has been revoked')
  if (link.expires_at.getTime() <= Date.now()) {
    throw forbidden('LINK_EXPIRED', 'That tracking link has expired')
  }

  // Counting views is what makes "who watched this trip" auditable later.
  await pool.query(`UPDATE guardian_links SET views = views + 1 WHERE id = $1`, [link.id])

  const raw = await redis.get(`trip:{${link.trip_id}}:last:driver`)
  const fix = raw ? (JSON.parse(raw) as { lat: number; lng: number; speed?: number; at: number }) : null

  const speed = fix?.speed ?? null
  const firstName = link.driver_name ? link.driver_name.trim().split(/\s+/)[0]! : null

  return {
    trip_id: link.trip_id,
    status: link.status,
    coords: fix ? { lat: fix.lat, lng: fix.lng } : null,
    speed_kmh: speed != null ? Math.round(speed) : null,
    speed_ceiling_kmh: link.speed_ceiling_kmh,
    over_ceiling: speed != null && speed > link.speed_ceiling_kmh,
    driver_first_name: firstName,
    vehicle: link.vehicle_model,
    updated_at: fix ? new Date(fix.at).toISOString() : null,
  }
}

export async function revokeGuardianLinks(tripId: string, customerId: string): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE guardian_links gl
        SET revoked_at = now()
       FROM trips t
      WHERE gl.trip_id = t.id
        AND gl.trip_id = $1
        AND t.customer_id = $2
        AND gl.revoked_at IS NULL`,
    [tripId, customerId],
  )
  return rowCount ?? 0
}

/** Called when a trip reaches a terminal state — a dead link leaks nothing. */
export async function revokeLinksForEndedTrip(tripId: string): Promise<void> {
  await pool.query(
    `UPDATE guardian_links SET revoked_at = now()
      WHERE trip_id = $1 AND revoked_at IS NULL`,
    [tripId],
  )
}

/** Texts the link to every guardian on the customer's account. */
export async function shareGuardianLink(
  tripId: string,
  customerId: string,
): Promise<{ sent: number; link: GuardianLink }> {
  const link = await createGuardianLink(tripId, customerId)

  const { rows } = await pool.query<{ name: string; phone: string }>(
    `SELECT name, phone FROM guardian_contacts WHERE user_id = $1 ORDER BY position`,
    [customerId],
  )

  const sms = getSmsProvider()
  for (const guardian of rows) {
    await sms
      .send(guardian.phone, `Follow my MyDriver trip live: ${link.url}`)
      .catch(() => undefined)
  }

  return { sent: rows.length, link }
}
