import Redis, { Cluster } from 'ioredis'
import { env } from '../config/env.js'

export type RedisClient = Redis | Cluster

function build(): RedisClient {
  const nodes = env.REDIS_URL.split(',').map((s) => s.trim()).filter(Boolean)

  if (env.REDIS_CLUSTER || nodes.length > 1) {
    return new Cluster(
      nodes.map((url) => {
        const u = new URL(url)
        return { host: u.hostname, port: Number(u.port || 6379) }
      }),
    )
  }
  return new Redis(nodes[0]!, { maxRetriesPerRequest: 3 })
}

export const redis: RedisClient = build()

/**
 * ioredis puts a connection into subscriber mode permanently once it
 * subscribes, and a subscriber connection cannot issue normal commands.
 * Pub/sub consumers must therefore own a dedicated connection.
 */
export const createSubscriber = (): RedisClient => build()

export async function closeRedis(): Promise<void> {
  await redis.quit()
}
