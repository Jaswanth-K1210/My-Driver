import { buildApp, setReady } from './app.js'
import { env } from './config/env.js'
import { closeDb } from './db/client.js'
import { startSweeper } from './modules/trips/sweeper.js'
import { getHub } from './realtime/hub.js'
import { closeRedis } from './redis/client.js'
import { getTelemetryWriter } from './telemetry/batch-writer.js'

const app = await buildApp()
const stopSweeper = startSweeper()

let shuttingDown = false

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  app.log.info({ signal }, 'draining')

  // 1. Fail readiness so the load balancer stops sending new traffic.
  setReady(false)
  await new Promise((resolve) => setTimeout(resolve, 2_000))

  try {
    stopSweeper()
    // 2. Stop accepting connections and let in-flight requests finish.
    await app.close()
    // 3. Never drop buffered telemetry.
    await getTelemetryWriter().stop()
    await getHub().close()
    await closeRedis()
    await closeDb()
    process.exit(0)
  } catch (err) {
    app.log.error({ err }, 'shutdown failed')
    process.exit(1)
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

await app.listen({ port: env.PORT, host: '0.0.0.0' })
