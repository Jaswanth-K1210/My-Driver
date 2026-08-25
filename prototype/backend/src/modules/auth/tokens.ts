import { createHash, randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { env } from '../../config/env.js'
import { pool } from '../../db/client.js'
import { unauthorized } from '../../lib/errors.js'
import { peppered, pepperedEquals } from '../../lib/hash.js'
import { newId } from '../../lib/ids.js'
import type { Role } from './otp.js'

export type TokenPair = {
  access_token: string
  refresh_token: string
  expires_in: number
}

export type AccessClaims = { sub: string; role: Role; jti: string }

type RefreshRow = {
  id: string
  user_id: string
  role: Role
  token_hash: string
  expires_at: Date
  revoked_at: Date | null
  chain_id: string
}

/**
 * A raw refresh token is `<selector>.<secret>`. The selector is hashed into the
 * row's primary key and looked up directly; only the secret is verified. Without
 * a selector we would have to verify against every live row, which is unusable.
 */
function mintRawToken(): { raw: string; selector: string; secret: string } {
  const selector = randomBytes(12).toString('base64url')
  const secret = randomBytes(32).toString('base64url')
  return { raw: `${selector}.${secret}`, selector, secret }
}

function splitRawToken(raw: string): { selector: string; secret: string } | null {
  const idx = raw.indexOf('.')
  if (idx <= 0 || idx === raw.length - 1) return null
  return { selector: raw.slice(0, idx), secret: raw.slice(idx + 1) }
}

const selectorKey = (selector: string): string =>
  createHash('sha256').update(selector).digest('hex')

async function insertToken(
  userId: string,
  role: Role,
  chainId: string,
  deviceId?: string,
): Promise<{ raw: string; id: string }> {
  const { raw, selector, secret } = mintRawToken()
  const id = selectorKey(selector)

  await pool.query(
    `INSERT INTO refresh_tokens (id, user_id, role, token_hash, device_id, expires_at, chain_id)
     VALUES ($1, $2, $3, $4, $5, now() + ($6 || ' seconds')::interval, $7)`,
    [
      id,
      userId,
      role,
      peppered(secret),
      deviceId ?? null,
      String(env.REFRESH_TOKEN_TTL_SECONDS),
      chainId,
    ],
  )
  return { raw, id }
}

export async function issueTokens(
  app: FastifyInstance,
  userId: string,
  role: Role,
  deviceId?: string,
): Promise<TokenPair> {
  const chainId = newId()
  const { raw } = await insertToken(userId, role, chainId, deviceId)

  const access_token = app.jwt.sign(
    { sub: userId, role, jti: newId() },
    { expiresIn: env.ACCESS_TOKEN_TTL_SECONDS },
  )

  return { access_token, refresh_token: raw, expires_in: env.ACCESS_TOKEN_TTL_SECONDS }
}

async function findToken(raw: string): Promise<RefreshRow | null> {
  const parts = splitRawToken(raw)
  if (!parts) return null

  const { rows } = await pool.query<RefreshRow>(
    `SELECT id, user_id, role, token_hash, expires_at, revoked_at, chain_id
       FROM refresh_tokens WHERE id = $1`,
    [selectorKey(parts.selector)],
  )
  const row = rows[0]
  if (!row) return null
  if (!pepperedEquals(parts.secret, row.token_hash)) return null
  return row
}

async function revokeChain(chainId: string): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = now() WHERE chain_id = $1 AND revoked_at IS NULL`,
    [chainId],
  )
}

export async function rotateRefreshToken(
  app: FastifyInstance,
  raw: string,
): Promise<TokenPair> {
  const row = await findToken(raw)
  if (!row) throw unauthorized('INVALID_REFRESH_TOKEN', 'Refresh token is not valid')

  if (row.revoked_at !== null) {
    // A consumed token presented again means it was captured. Kill the whole
    // chain so the attacker and the real client are both logged out.
    await revokeChain(row.chain_id)
    throw unauthorized('REFRESH_TOKEN_REUSED', 'Refresh token has already been used')
  }

  if (row.expires_at.getTime() <= Date.now()) {
    throw unauthorized('REFRESH_TOKEN_EXPIRED', 'Refresh token has expired')
  }

  const replacement = await insertToken(row.user_id, row.role, row.chain_id)
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1`,
    [row.id, replacement.id],
  )

  const access_token = app.jwt.sign(
    { sub: row.user_id, role: row.role, jti: newId() },
    { expiresIn: env.ACCESS_TOKEN_TTL_SECONDS },
  )

  return {
    access_token,
    refresh_token: replacement.raw,
    expires_in: env.ACCESS_TOKEN_TTL_SECONDS,
  }
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  const row = await findToken(raw)
  if (!row) return // Revoking an unknown token is a no-op, not an error.
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
    [row.id],
  )
}
