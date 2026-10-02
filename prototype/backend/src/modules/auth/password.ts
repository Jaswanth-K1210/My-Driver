import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { pool } from '../../db/client.js'
import { tooManyRequests, unauthorized } from '../../lib/errors.js'
import { hashPassword, verifyPassword } from '../../lib/password.js'
import { consumeQuota } from '../../lib/rate-limit.js'
import { audit } from '../safety-desk/service.js'
import { SELF_SERVICE_ROLES, type Role } from './roles.js'
import { getUserRoles, type PublicUser } from './service.js'
import { issueTokens, type TokenPair } from './tokens.js'

// Compared against when the email is unknown, so a missing account costs the
// same scrypt time as a wrong password and the response time reveals nothing.
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'))

/** When an operator holds several roles, the session takes the broadest. */
const STAFF_ROLE_PRIORITY: Role[] = ['SUPER_ADMIN', 'OPS_MANAGER', 'SAFETY_DESK_AGENT', 'FINANCE']

const PER_EMAIL_LIMIT = 5
const PER_IP_LIMIT = 30
const WINDOW_SECONDS = 15 * 60

export async function staffLogin(
  app: FastifyInstance,
  input: { email: string; password: string; ip: string; deviceId?: string },
): Promise<{ tokens: TokenPair; user: PublicUser }> {
  const email = input.email.trim().toLowerCase()

  for (const [key, limit] of [
    [`staff:email:${email}`, PER_EMAIL_LIMIT],
    [`staff:ip:${input.ip}`, PER_IP_LIMIT],
  ] as const) {
    const q = await consumeQuota(key, limit, WINDOW_SECONDS)
    if (!q.allowed) {
      throw tooManyRequests('LOGIN_RATE_LIMITED', 'Too many sign-in attempts; try again later')
    }
  }

  const { rows } = await pool.query<{
    id: string
    phone_number: string | null
    email: string | null
    full_name: string | null
    password_hash: string | null
  }>(
    `SELECT id, phone_number, email, full_name, password_hash FROM users WHERE email = $1`,
    [email],
  )
  const row = rows[0]

  const ok = await verifyPassword(input.password, row?.password_hash ?? (await DUMMY_HASH))
  // One message for every failure: probing must not reveal which emails exist.
  const invalid = unauthorized('INVALID_CREDENTIALS', 'Email or password is incorrect')
  if (!row?.password_hash || !ok) throw invalid

  const held = await getUserRoles(row.id)
  const role = STAFF_ROLE_PRIORITY.find((r) => held.includes(r) && !SELF_SERVICE_ROLES.includes(r))
  if (!role) throw invalid

  await audit(row.id, role, 'STAFF_LOGIN', row.id, { ip: input.ip })

  const tokens = await issueTokens(app, row.id, role, input.deviceId)
  const { password_hash: _, ...user } = row
  return { tokens, user: { ...user, role } }
}
