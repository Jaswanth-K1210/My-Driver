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
