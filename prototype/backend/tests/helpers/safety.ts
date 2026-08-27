import type { FastifyInstance } from 'fastify'
import { pool } from '../../src/db/client.js'
import { redis } from '../../src/redis/client.js'
import { loginAs } from './auth.js'

/** Grants an extra role to an existing account and returns a token for it. */
export async function loginAsRole(
  app: FastifyInstance,
  phone: string,
  role: string,
): Promise<{ userId: string; accessToken: string }> {
  // The account must exist before a privileged role can be granted to it.
  const seed = await loginAs(app, phone, 'CUSTOMER')
  await pool.query(
    `INSERT INTO user_roles (user_id, role) VALUES ($1, $2::user_role)
     ON CONFLICT (user_id, role) DO NOTHING`,
    [seed.userId, role],
  )

  const token = app.jwt.sign({ sub: seed.userId, role, jti: `test-${Date.now()}` }, {
    expiresIn: 900,
  })
  return { userId: seed.userId, accessToken: token }
}

/** Places a device's last-known position where the integrity engine reads it. */
export async function setLastFix(
  tripId: string,
  source: 'driver' | 'customer',
  coords: { lat: number; lng: number },
  speed?: number,
  atOffsetMs = 0,
): Promise<void> {
  await redis.set(
    `trip:{${tripId}}:last:${source}`,
    JSON.stringify({ ...coords, speed, at: Date.now() + atOffsetMs }),
    'EX',
    120,
  )
}

export const liveEscalation = async (tripId: string) => {
  const { rows } = await pool.query(
    `SELECT id, level, status, reason, sla_deadline FROM escalations
      WHERE trip_id = $1 AND status <> 'RESOLVED'`,
    [tripId],
  )
  return rows[0] ?? null
}

export const escalationEventTypes = async (escalationId: string): Promise<string[]> => {
  const { rows } = await pool.query<{ type: string }>(
    `SELECT type FROM escalation_events WHERE escalation_id = $1 ORDER BY created_at, type`,
    [escalationId],
  )
  return rows.map((r) => r.type)
}

export const auditActions = async (): Promise<string[]> => {
  const { rows } = await pool.query<{ action: string }>(
    `SELECT action FROM audit_log ORDER BY created_at`,
  )
  return rows.map((r) => r.action)
}
