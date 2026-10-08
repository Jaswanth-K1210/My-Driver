import type { FastifyInstance } from 'fastify'
import { ensureDriverProfile } from '../trips/rate-cards.js'
import { pool } from '../../db/client.js'
import { forbidden, unauthorized } from '../../lib/errors.js'
import { OTP_MAX_ATTEMPTS, verifyOtpHash, type Role } from './otp.js'
import { issueTokens, type TokenPair } from './tokens.js'
import { SELF_SERVICE_ROLES } from './roles.js'

export type PublicUser = {
  id: string
  role: Role
  phone_number: string | null
  email: string | null
  full_name: string | null
}

export async function findOrCreateUserByPhone(phoneNumber: string): Promise<{ id: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (phone_number, phone_verified_at)
     VALUES ($1, now())
     ON CONFLICT (phone_number)
       DO UPDATE SET phone_verified_at = now(), updated_at = now()
     RETURNING id`,
    [phoneNumber],
  )
  return { id: rows[0]!.id }
}

export async function grantRole(userId: string, role: Role): Promise<void> {
  await pool.query(
    `INSERT INTO user_roles (user_id, role) VALUES ($1, $2)
     ON CONFLICT (user_id, role) DO NOTHING`,
    [userId, role],
  )
}

/**
 * Grant on sign-in, but only where signing in is allowed to create the role.
 *
 * Both the OTP path and the Google path call this instead of grantRole, so the
 * rule holds wherever a session is minted rather than in one of the two.
 */
export async function grantRoleOnSignIn(userId: string, role: Role): Promise<void> {
  if (SELF_SERVICE_ROLES.includes(role)) {
    await grantRole(userId, role)
    // A driver exists for onboarding from first sign-in, not first time online:
    // the KYC checklist and the admin review queue both need the profile row.
    if (role === 'DRIVER') await ensureDriverProfile(userId)
    return
  }

  const held = await getUserRoles(userId)
  if (!held.includes(role)) {
    // Deliberately the same message whether the account exists, lacks the role,
    // or was never provisioned: probing this endpoint must not reveal who holds
    // a privileged role.
    throw forbidden(
      'ROLE_NOT_GRANTED',
      'This account does not hold that role. Privileged roles are provisioned by an operator.',
    )
  }
}

export async function getUserRoles(userId: string): Promise<Role[]> {
  const { rows } = await pool.query<{ role: Role }>(
    `SELECT role FROM user_roles WHERE user_id = $1 AND status = 'ACTIVE' ORDER BY role`,
    [userId],
  )
  return rows.map((r) => r.role)
}

export async function verifyOtp(
  app: FastifyInstance,
  input: { phoneNumber: string; otp: string; role: Role; deviceId?: string },
): Promise<{ tokens: TokenPair; user: PublicUser }> {
  const { rows } = await pool.query<{ id: string; code_hash: string; attempts: number }>(
    `SELECT id, code_hash, attempts
       FROM otp_challenges
      WHERE phone_number = $1 AND role = $2
        AND consumed_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1`,
    [input.phoneNumber, input.role],
  )

  const challenge = rows[0]
  if (!challenge) throw unauthorized('INVALID_OTP', 'That code is not valid or has expired')

  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    await pool.query(`UPDATE otp_challenges SET consumed_at = now() WHERE id = $1`, [challenge.id])
    throw unauthorized('OTP_ATTEMPTS_EXHAUSTED', 'Too many incorrect attempts; request a new code')
  }

  if (!verifyOtpHash(challenge.code_hash, input.otp)) {
    await pool.query(`UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1`, [
      challenge.id,
    ])
    throw unauthorized('INVALID_OTP', 'That code is not valid or has expired')
  }

  await pool.query(`UPDATE otp_challenges SET consumed_at = now() WHERE id = $1`, [challenge.id])

  const user = await findOrCreateUserByPhone(input.phoneNumber)
  await grantRoleOnSignIn(user.id, input.role)

  const { rows: userRows } = await pool.query<Omit<PublicUser, 'role'>>(
    `SELECT id, phone_number, email, full_name FROM users WHERE id = $1`,
    [user.id],
  )

  const tokens = await issueTokens(app, user.id, input.role, input.deviceId)
  return { tokens, user: { ...userRows[0]!, role: input.role } }
}
