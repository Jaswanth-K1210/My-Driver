import { randomInt } from 'node:crypto'
import { pool } from '../../db/client.js'
import { tooManyRequests } from '../../lib/errors.js'
import { peppered, pepperedEquals } from '../../lib/hash.js'
import { consumeQuota } from '../../lib/rate-limit.js'
import { getSmsProvider } from '../../providers/sms/index.js'

// Re-exported so existing imports keep working; the definitions live in a
// side-effect-free module (see roles.ts).
import type { Role } from './roles.js'

export { ROLES, DESK_ROLES } from './roles.js'
export type { Role } from './roles.js'

export const OTP_DIGITS = 6
export const OTP_TTL_SECONDS = 300
export const OTP_MAX_ATTEMPTS = 5

const PER_PHONE_LIMIT = 3
const PER_PHONE_WINDOW_SECONDS = 15 * 60
const PER_IP_LIMIT = 10
const PER_IP_WINDOW_SECONDS = 60 * 60

/** Cryptographically uniform code — never Math.random for a security token. */
export function generateOtpCode(digits: number = OTP_DIGITS): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, '0')
}

export const hashOtpCode = (code: string): string => peppered(code)
export const verifyOtpHash = (hash: string, code: string): boolean =>
  pepperedEquals(code, hash)

export async function requestOtp(input: {
  phoneNumber: string
  role: Role
  ip: string
}): Promise<{ expiresIn: number }> {
  const phoneQuota = await consumeQuota(
    `otp:phone:${input.phoneNumber}`,
    PER_PHONE_LIMIT,
    PER_PHONE_WINDOW_SECONDS,
  )
  if (!phoneQuota.allowed) {
    throw tooManyRequests(
      'OTP_RATE_LIMITED',
      'Too many verification codes requested for this number',
      { retry_after_seconds: phoneQuota.retryAfterSeconds },
    )
  }

  const ipQuota = await consumeQuota(`otp:ip:${input.ip}`, PER_IP_LIMIT, PER_IP_WINDOW_SECONDS)
  if (!ipQuota.allowed) {
    throw tooManyRequests(
      'OTP_RATE_LIMITED',
      'Too many verification codes requested from this network',
      { retry_after_seconds: ipQuota.retryAfterSeconds },
    )
  }

  const code = generateOtpCode()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // A new code supersedes any live one, so an old code can never be replayed.
    await client.query(
      `UPDATE otp_challenges SET consumed_at = now()
        WHERE phone_number = $1 AND consumed_at IS NULL`,
      [input.phoneNumber],
    )
    await client.query(
      `INSERT INTO otp_challenges (phone_number, role, code_hash, expires_at, request_ip)
       VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval, $5)`,
      [input.phoneNumber, input.role, hashOtpCode(code), String(OTP_TTL_SECONDS), input.ip],
    )
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }

  await getSmsProvider().send(
    input.phoneNumber,
    `${code} is your MyDriver verification code. It expires in 5 minutes.`,
  )

  return { expiresIn: OTP_TTL_SECONDS }
}
