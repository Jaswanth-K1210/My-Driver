import { randomToken } from '../lib/hash.js'
import type { Role } from '../modules/auth/otp.js'
import { redis } from '../redis/client.js'

export const TICKET_TTL_SECONDS = 60

/**
 * A JWT in a WebSocket query string is written into every proxy and access
 * log. A single-use 60-second ticket is not worth capturing.
 */
export async function issueTicket(userId: string, role: Role): Promise<string> {
  const ticket = randomToken(24)
  await redis.set(`ticket:${ticket}`, JSON.stringify({ userId, role }), 'EX', TICKET_TTL_SECONDS)
  return ticket
}

export async function consumeTicket(
  ticket: string,
): Promise<{ userId: string; role: Role } | null> {
  // GETDEL is atomic: two connections racing the same ticket cannot both win.
  const raw = await redis.getdel(`ticket:${ticket}`)
  if (!raw) return null
  return JSON.parse(raw) as { userId: string; role: Role }
}
