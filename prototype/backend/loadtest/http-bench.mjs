/**
 * Test 3 — HTTP path latency under concurrency.
 *
 * Quote is the read-heavy hot path (every keystroke in the booking form debounces
 * into one). Booking is the write path, and is idempotent.
 *
 *   node loadtest/http-bench.mjs --concurrency 50 --requests 1000
 */
import { BASE, api, cachedTokens, metrics, summarise } from './lib.mjs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : Number(process.argv[i + 1])
}

const CONCURRENCY = arg('concurrency', 50)
const REQUESTS = arg('requests', 1000)

const PICKUP = { lat: 17.4399, lng: 78.3813 }
const DROP = { lat: 17.4256, lng: 78.332 }

const tokens = await cachedTokens(4, 'CUSTOMER', '+91970000')
console.log(`\nHTTP bench → ${BASE}`)
console.log(`  concurrency ${CONCURRENCY}, ${REQUESTS} requests per scenario\n`)

async function run(label, fn) {
  const latencies = []
  let errors = 0
  let issued = 0

  const worker = async (workerIndex) => {
    while (true) {
      const n = issued++
      if (n >= REQUESTS) return
      const t0 = performance.now()
      try {
        await fn(tokens[workerIndex % tokens.length], n)
        latencies.push(performance.now() - t0)
      } catch {
        errors++
      }
    }
  }

  const t0 = performance.now()
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)))
  const seconds = (performance.now() - t0) / 1000

  const s = summarise(label, latencies)
  console.log(
    `  ${label.padEnd(22)} ${Math.round(REQUESTS / seconds).toString().padStart(6)} req/s   ` +
      `p50 ${String(s.p50).padStart(4)}ms  p95 ${String(s.p95).padStart(4)}ms  ` +
      `p99 ${String(s.p99).padStart(4)}ms  errors ${errors}`,
  )
  return s
}

await run('GET /v1/rate-cards', (token) => api('/v1/rate-cards'))

await run('GET /v1/me', (token) => api('/v1/me', { token }))

await run('POST /v1/trips/quote', (token) =>
  api('/v1/trips/quote', {
    method: 'POST',
    token,
    body: {
      booking_type: 'POINT_TO_POINT',
      pickup: PICKUP,
      drop: DROP,
      required_certification: 'MD-Standard',
    },
  }),
)

await run('POST /v1/realtime/ticket', (token) =>
  api('/v1/realtime/ticket', { method: 'POST', token }),
)

const after = await metrics()
console.log(
  `\n  server RSS ${Math.round((after.mydriver_process_rss_bytes ?? 0) / 1048576)} MB` +
    `   db pool ${after.mydriver_db_pool_total} total / ${after.mydriver_db_pool_waiting} waiting\n`,
)
