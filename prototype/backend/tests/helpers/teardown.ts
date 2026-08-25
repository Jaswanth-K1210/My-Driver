import { closeDb } from '../../src/db/client.js'
import { getHub } from '../../src/realtime/hub.js'
import { closeRedis } from '../../src/redis/client.js'
import { getTelemetryWriter } from '../../src/telemetry/batch-writer.js'

/**
 * The db pool, the Redis client and the hub subscriber are module-level
 * singletons. Without an explicit teardown their open handles keep the Vitest
 * process alive after the last test finishes.
 */
export default async function teardown(): Promise<void> {
  await getTelemetryWriter().stop().catch(() => undefined)
  await getHub().close().catch(() => undefined)
  await closeRedis().catch(() => undefined)
  await closeDb().catch(() => undefined)
}
