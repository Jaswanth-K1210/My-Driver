import { redis } from '../../redis/client.js'

/**
 * The driver app polls for offers every few seconds while ONLINE, and nearly
 * every poll finds nothing. This flag lets that poll skip Postgres: dispatch
 * raises it just before writing an offer, and it expires with the offer.
 *
 * It is a hint, not the source of truth. A raised flag only means "look in
 * Postgres"; a missing one means there is nothing to find.
 */
const key = (driverId: string): string => `offer:pending:${driverId}`

/** A little longer than the offer so a poll never misses its last seconds. */
const GRACE_SECONDS = 10

export async function flagPendingOffer(driverId: string, offerTtlSeconds: number): Promise<void> {
  await redis.set(key(driverId), '1', 'EX', offerTtlSeconds + GRACE_SECONDS)
}

export async function mayHavePendingOffer(driverId: string): Promise<boolean> {
  try {
    return (await redis.exists(key(driverId))) === 1
  } catch {
    // Redis unreachable: fall back to asking Postgres rather than hide an offer.
    return true
  }
}

/**
 * Offers a driver let expire in a row. A phone that died or an app that was
 * killed leaves the driver ONLINE, and every offer to them costs a customer a
 * 20-second dispatch round out of three. Past this many, they are taken
 * offline. Answering any offer, either way, resets the count.
 */
export const MAX_MISSED_OFFERS = 2
const missedKey = (driverId: string): string => `offer:missed:${driverId}`

/** Counts one expired offer; true once the driver has missed too many. */
export async function recordMissedOffer(driverId: string): Promise<boolean> {
  const n = await redis.incr(missedKey(driverId))
  // A slow evening is not a dead phone: misses hours apart do not add up.
  await redis.expire(missedKey(driverId), 30 * 60)
  if (n < MAX_MISSED_OFFERS) return false
  await redis.del(missedKey(driverId))
  return true
}

export async function clearMissedOffers(driverId: string): Promise<void> {
  await redis.del(missedKey(driverId))
}
