import type { FastifyInstance } from 'fastify'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { googleClientIds } from '../../config/env.js'
import { pool } from '../../db/client.js'
import { unauthorized } from '../../lib/errors.js'
import type { Role } from './otp.js'
import { grantRole, type PublicUser } from './service.js'
import { issueTokens, type TokenPair } from './tokens.js'

export type GoogleIdentity = {
  sub: string
  email: string | null
  emailVerified: boolean
  name: string | null
}

const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

async function defaultVerifier(idToken: string): Promise<GoogleIdentity> {
  const audiences = googleClientIds()
  if (audiences.length === 0) throw new Error('GOOGLE_CLIENT_IDS is not configured')

  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: audiences,
  })

  return {
    sub: String(payload.sub),
    email: typeof payload.email === 'string' ? payload.email : null,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === 'string' ? payload.name : null,
  }
}

let verifier: (idToken: string) => Promise<GoogleIdentity> = defaultVerifier

/** Test seam. Passing undefined restores real JWKS verification. */
export function setGoogleVerifier(
  fn: ((token: string) => Promise<GoogleIdentity>) | undefined,
): void {
  verifier = fn ?? defaultVerifier
}

export const verifyGoogleIdToken = (idToken: string): Promise<GoogleIdentity> => verifier(idToken)

async function resolveUser(identity: GoogleIdentity): Promise<string> {
  const bySub = await pool.query<{ id: string }>(`SELECT id FROM users WHERE google_sub = $1`, [
    identity.sub,
  ])
  if (bySub.rows[0]) return bySub.rows[0].id

  // Link by email only when Google asserts the address is verified. An
  // unverified address is attacker-controllable and must never merge accounts.
  if (identity.email && identity.emailVerified) {
    const byEmail = await pool.query<{ id: string }>(
      `UPDATE users SET google_sub = $1, updated_at = now()
        WHERE email = $2 AND google_sub IS NULL
        RETURNING id`,
      [identity.sub, identity.email],
    )
    if (byEmail.rows[0]) return byEmail.rows[0].id
  }

  const created = await pool.query<{ id: string }>(
    `INSERT INTO users (google_sub, email, full_name) VALUES ($1, $2, $3) RETURNING id`,
    [identity.sub, identity.emailVerified ? identity.email : null, identity.name],
  )
  return created.rows[0]!.id
}

export async function signInWithGoogle(
  app: FastifyInstance,
  input: { idToken: string; role: Role; deviceId?: string },
): Promise<{ tokens: TokenPair; user: PublicUser }> {
  let identity: GoogleIdentity
  try {
    identity = await verifyGoogleIdToken(input.idToken)
  } catch {
    throw unauthorized('INVALID_GOOGLE_TOKEN', 'Google token could not be verified')
  }

  const userId = await resolveUser(identity)
  await grantRole(userId, input.role)

  const { rows } = await pool.query<Omit<PublicUser, 'role'>>(
    `SELECT id, phone_number, email, full_name FROM users WHERE id = $1`,
    [userId],
  )
  const tokens = await issueTokens(app, userId, input.role, input.deviceId)

  return { tokens, user: { ...rows[0]!, role: input.role } }
}
