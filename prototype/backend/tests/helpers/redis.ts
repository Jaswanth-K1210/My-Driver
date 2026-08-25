import { redis } from '../../src/redis/client.js'

/** Remove only this service's keys, never the whole database. */
export async function resetRedis(): Promise<void> {
  const patterns = ['quota:*', 'otp:*', 'ticket:*', 'offer:*', 'drivers:*', 'trip:*', 'geo:*', 'ratecard:*']
  for (const pattern of patterns) {
    const keys = await redis.keys(pattern)
    if (keys.length > 0) await redis.del(...keys)
  }
}
