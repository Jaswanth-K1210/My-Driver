/**
 * Test 1 — WebSocket connection scale.
 *
 * How many concurrent sockets does one backend process hold, and what does each
 * cost in memory? That ratio is what turns "1,000,000 concurrent users" into an
 * instance count.
 *
 * Sockets here are idle (heartbeat only). Telemetry throughput is measured
 * separately in telemetry-bench.mjs, because the gateway caps ingest at one
 * frame per second per socket — saturating the write path from this side would
 * need ~133k sockets, which one laptop cannot host alongside the server.
 *
 *   node loadtest/ws-soak.mjs --connections 2000 --hold 15
 */
import { BASE, api, cachedTokens, metrics, sleep, summarise } from './lib.mjs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : Number(process.argv[i + 1])
}

const TARGET = arg('connections', 2000)
const HOLD_S = arg('hold', 15)
const USERS = arg('users', 4)
const OPEN_CONCURRENCY = arg('concurrency', 100)

console.log(`\nWebSocket soak → ${BASE}`)
console.log(`  target sockets : ${TARGET}`)
console.log(`  hold           : ${HOLD_S}s\n`)

// One user can mint any number of single-use tickets, so a handful of accounts
// is enough to open tens of thousands of sockets.
const tokens = await cachedTokens(USERS, 'CUSTOMER', '+91970000')
console.log(`  ${tokens.length} users authenticated`)

const metricsBefore = await metrics()
const rssMb = (m) => Math.round((m.mydriver_process_rss_bytes ?? 0) / 1048576)
const rssBefore = rssMb(metricsBefore)

const sockets = []
const openLatencies = []
let failures = 0
const startedAt = Date.now()

async function openOne(index) {
  const token = tokens[index % tokens.length]
  const t0 = Date.now()
  try {
    // Tickets are single use, so each socket mints its own.
    const { ticket } = await api('/v1/realtime/ticket', { method: 'POST', token })
    const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}/v1/integrity?ticket=${ticket}`)

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('open timeout')), 15_000)
      ws.onopen = () => {
        clearTimeout(timer)
        resolve()
      }
      ws.onerror = () => {
        clearTimeout(timer)
        reject(new Error('open failed'))
      }
    })

    ws.onmessage = (event) => {
      const frame = JSON.parse(String(event.data))
      if (frame.type === 'PING') ws.send(JSON.stringify({ type: 'PONG' }))
    }

    sockets.push(ws)
    openLatencies.push(Date.now() - t0)
  } catch {
    failures++
  }
}

// Ramp in waves so the accept queue is exercised but not instantly flooded.
for (let i = 0; i < TARGET; i += OPEN_CONCURRENCY) {
  const wave = []
  for (let j = i; j < Math.min(i + OPEN_CONCURRENCY, TARGET); j++) wave.push(openOne(j))
  await Promise.all(wave)

  if ((i + OPEN_CONCURRENCY) % 500 === 0 || i + OPEN_CONCURRENCY >= TARGET) {
    const rss = rssMb(await metrics())
    console.log(`  open ${String(sockets.length).padStart(6)}  failures ${failures}  server RSS ${rss} MB`)
  }
}

const openSeconds = (Date.now() - startedAt) / 1000
const rssAfterOpen = rssMb(await metrics())

console.log(`\n  holding ${HOLD_S}s…`)
await sleep(HOLD_S * 1000)

const metricsAfter = await metrics()
const rssHeld = rssMb(metricsAfter)
const alive = sockets.filter((s) => s.readyState === 1).length

const lat = summarise('open latency', openLatencies)
const perSocketKb = alive > 0 ? Math.round(((rssHeld - rssBefore) * 1024) / alive) : null

console.log(`\n─── results ────────────────────────────────────────────`)
console.log(`  requested            ${TARGET}`)
console.log(`  established          ${sockets.length}`)
console.log(`  still open after hold ${alive}`)
console.log(`  failures             ${failures}`)
console.log(`  ramp duration        ${openSeconds.toFixed(1)}s  (${Math.round(sockets.length / openSeconds)}/s)`)
console.log(`  open latency ms      p50 ${lat.p50}  p95 ${lat.p95}  p99 ${lat.p99}  max ${lat.max}`)
console.log(`  server RSS           ${rssBefore} MB → ${rssAfterOpen} MB → ${rssHeld} MB (held)`)
console.log(`  memory per socket    ${perSocketKb != null ? `${perSocketKb} KB` : 'n/a'}`)
console.log(`  gauge ws_connections ${metricsBefore.mydriver_ws_connections} → ${metricsAfter.mydriver_ws_connections}`)
console.log(`  db pool waiting      ${metricsAfter.mydriver_db_pool_waiting}`)

if (perSocketKb && perSocketKb > 0) {
  const perInstance = Math.floor((3 * 1024 * 1024) / perSocketKb) // 3 GB heap budget
  console.log(`\n  extrapolation (3 GB per instance):`)
  console.log(`    sockets per instance ≈ ${perInstance.toLocaleString()}`)
  console.log(`    instances for 1,000,000 ≈ ${Math.ceil(1_000_000 / perInstance)}`)
}

for (const s of sockets) s.close()
await sleep(500)
console.log()
