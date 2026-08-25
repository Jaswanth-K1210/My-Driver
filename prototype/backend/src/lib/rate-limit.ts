import { redis } from '../redis/client.js'

export type QuotaResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

/**
 * Fixed-window counter. The first call in a window sets the expiry; subsequent
 * calls only increment, so the window rolls forward rather than sliding.
 * Atomic in Redis, so it is correct across every app instance.
 */
export async function consumeQuota(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<QuotaResult> {
  const redisKey = `quota:${key}`

  const results = await redis.multi().incr(redisKey).ttl(redisKey).exec()
  const count = Number(results?.[0]?.[1] ?? 0)
  const ttl = Number(results?.[1]?.[1] ?? -1)

  // TTL of -1 means the key exists with no expiry: this was the first increment.
  if (ttl < 0) await redis.expire(redisKey, windowSeconds)

  const retryAfterSeconds = ttl > 0 ? ttl : windowSeconds

  if (count > limit) return { allowed: false, remaining: 0, retryAfterSeconds }
  return { allowed: true, remaining: limit - count, retryAfterSeconds }
}
