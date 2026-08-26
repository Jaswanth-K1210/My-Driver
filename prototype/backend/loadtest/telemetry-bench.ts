/**
 * Test 2 — telemetry write path capacity.
 *
 * This is the number the whole scale story hinges on. At 1,000,000 concurrent
 * users the design projects ~133,000 telemetry rows/second; the README claims a
 * single-node TimescaleDB sustains roughly 50,000 and that a durable stream
 * buffer becomes mandatory above that. Neither figure had ever been measured.
 *
 * Driving this from WebSockets is impossible on one machine: the gateway caps
 * ingest at one frame per second per socket, so 133k rows/s would need 133k
 * sockets. Instead this measures the write path directly, using the same
 * multi-row INSERT statement TelemetryBatchWriter emits.
 *
 *   npx tsx loadtest/telemetry-bench.ts
 */
import { randomUUID } from 'node:crypto'
import { pool, closeDb } from '../src/db/client.js'
import { TelemetryBatchWriter } from '../src/telemetry/batch-writer.js'

const TOTAL_ROWS = Number(process.env.ROWS ?? 120_000)

// Postgres allows 65535 bind parameters per statement and each row uses 9,
// so a single statement tops out at 7281 rows.
const BATCH_SIZES = [100, 250, 500, 1000, 2500, 5000]

const tripId = randomUUID()
const baseTime = Date.now()

function makeRows(count: number, offset: number) {
  const values: unknown[] = []
  const tuples: string[] = []
  for (let i = 0; i < count; i++) {
    const b = i * 9
    values.push(
      new Date(baseTime + (offset + i) * 10),
      tripId,
      'DRIVER',
      17.4399 + (i % 1000) * 0.00001,
      78.3813 + (i % 1000) * 0.00001,
      45.5,
      182.4,
      0.12,
      0.04,
    )
    tuples.push(
      `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`,
    )
  }
  return { values, tuples }
}

const INSERT = (tuples: string[]) =>
  `INSERT INTO telematics_logs
     (time, trip_id, source, lat, lng, speed_kmh, heading, accel_z, gyro_z)
   VALUES ${tuples.join(',')}`

async function benchBatch(size: number): Promise<number> {
  const batches = Math.floor(TOTAL_ROWS / size)
  // Prebuild so statement construction is not counted as database time.
  const prepared = Array.from({ length: batches }, (_, i) => makeRows(size, i * size))

  const t0 = process.hrtime.bigint()
  for (const { values, tuples } of prepared) {
    await pool.query(INSERT(tuples), values)
  }
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6

  return Math.round((batches * size) / (elapsedMs / 1000))
}

/** Concurrency: several writers share the pool, as separate instances would. */
async function benchConcurrent(size: number, writers: number): Promise<number> {
  const perWriter = Math.floor(TOTAL_ROWS / writers / size)
  const prepared = Array.from({ length: writers }, (_, w) =>
    Array.from({ length: perWriter }, (_, i) => makeRows(size, (w * perWriter + i) * size)),
  )

  const t0 = process.hrtime.bigint()
  await Promise.all(
    prepared.map(async (batches) => {
      for (const { values, tuples } of batches) await pool.query(INSERT(tuples), values)
    }),
  )
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6

  return Math.round((writers * perWriter * size) / (elapsedMs / 1000))
}

console.log(`\nTelemetry write path — ${TOTAL_ROWS.toLocaleString()} rows per run\n`)

await pool.query('DELETE FROM telematics_logs WHERE trip_id = $1', [tripId])

console.log('  single writer, by batch size')
const singleResults: Array<[number, number]> = []
for (const size of BATCH_SIZES) {
  const rate = await benchBatch(size)
  singleResults.push([size, rate])
  console.log(`    batch ${String(size).padStart(5)}   ${rate.toLocaleString().padStart(9)} rows/s`)
}

const best = singleResults.reduce((a, b) => (b[1] > a[1] ? b : a))
console.log(`\n  concurrent writers, batch ${best[0]}`)
for (const writers of [2, 4, 8]) {
  const rate = await benchConcurrent(best[0], writers)
  console.log(`    ${writers} writers    ${rate.toLocaleString().padStart(9)} rows/s`)
}

// The real class, at its configured 100-row / 2-second flush policy.
console.log('\n  TelemetryBatchWriter (production settings)')
const writer = new TelemetryBatchWriter()
const t0 = process.hrtime.bigint()
for (let i = 0; i < TOTAL_ROWS; i++) {
  writer.enqueue({
    time: new Date(baseTime + i * 10),
    tripId,
    source: 'DRIVER',
    lat: 17.4399,
    lng: 78.3813,
    speedKmh: 45.5,
    heading: 182.4,
    accelZ: 0.12,
    gyroZ: 0.04,
  })
  // Yield so the auto-flush at 100 rows can actually run.
  if (i % 100 === 0) await new Promise((r) => setImmediate(r))
}
await writer.stop()
const writerMs = Number(process.hrtime.bigint() - t0) / 1e6
console.log(
  `    end to end   ${Math.round(TOTAL_ROWS / (writerMs / 1000)).toLocaleString().padStart(9)} rows/s` +
    `   (written ${writer.written.toLocaleString()}, dropped ${writer.dropped})`,
)

const { rows } = await pool.query<{ n: string; bytes: string }>(
  `SELECT count(*) AS n, pg_size_pretty(pg_total_relation_size('telematics_logs')) AS bytes
     FROM telematics_logs WHERE trip_id = $1`,
  [tripId],
)
console.log(`\n  rows persisted for this run: ${Number(rows[0]!.n).toLocaleString()}`)
console.log(`  hypertable total size:       ${rows[0]!.bytes}`)

await pool.query('DELETE FROM telematics_logs WHERE trip_id = $1', [tripId])
await closeDb()
console.log()
