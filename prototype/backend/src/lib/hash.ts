import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'

/**
 * HMAC-SHA256 with a server-side pepper. Correct for high-entropy secrets
 * (256-bit refresh tokens) and for short-lived rate-limited codes (OTPs).
 * Roughly 1000x cheaper than a password KDF, which is what makes the auth
 * path survivable at a million concurrent users.
 */
export function peppered(value: string): string {
  return createHmac('sha256', env.TOKEN_PEPPER).update(value).digest('hex')
}

export function pepperedEquals(value: string, storedHex: string): boolean {
  const a = Buffer.from(peppered(value), 'hex')
  const b = Buffer.from(storedHex, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url')
