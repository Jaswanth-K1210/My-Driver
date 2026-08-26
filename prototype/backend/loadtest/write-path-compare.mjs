/**
 * Isolates where the telemetry write path spends its time: the application,
 * PgBouncer, or the database itself.
 *
 * Same statement shape as TelemetryBatchWriter, run against three targets.
 */
import pg from 'pg'
import { randomUUID } from 'node:crypto'

const TARGETS = {
  pgbouncer: 'postgres://mydriver:mydriver@localhost:6432/mydriver',
  direct: 'postgres://mydriver:mydriver@localhost:5433/mydriver',
}

const ROWS = Number(process.env.ROWS ?? 20_000)
const BATCHES = [500, 1000, 2500]
const tripId = randomUUID()
const base = Date.now()

function build(count, offset) {
  const values = []
  const tuples = []
  for (let i = 0; i < count; i++) {
    const b = i * 9
    values.push(new Date(base + (offset + i) * 10), tripId, 'DRIVER',
      17.4399, 78.3813, 45.5, 182.4, 0.12, 0.04)
    tuples.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9})`)
  }
  return { values, sql:
    `INSERT INTO telematics_logs (time, trip_id, source, lat, lng, speed_kmh, heading, accel_z, gyro_z)
     VALUES ${tuples.join(',')}` }
}

console.log(`\nWrite path comparison — ${ROWS.toLocaleString()} rows per cell\n`)
console.log('  target      batch      rows/s')
console.log('  ─────────────────────────────────')

for (const [name, url] of Object.entries(TARGETS)) {
  const pool = new pg.Pool({ connectionString: url, max: 4 })
  for (const size of BATCHES) {
    const n = Math.floor(ROWS / size)
    const prepared = Array.from({ length: n }, (_, i) => build(size, i * size))
    const t0 = process.hrtime.bigint()
    for (const { sql, values } of prepared) await pool.query(sql, values)
    const secs = Number(process.hrtime.bigint() - t0) / 1e9
    console.log(`  ${name.padEnd(11)} ${String(size).padStart(5)}  ${Math.round((n*size)/secs).toLocaleString().padStart(10)}`)
  }
  // Parallel writers against the same target.
  const size = 1000
  const perWriter = Math.floor(ROWS / 4 / size)
  const sets = Array.from({ length: 4 }, (_, w) =>
    Array.from({ length: perWriter }, (_, i) => build(size, (w * perWriter + i) * size)))
  const t0 = process.hrtime.bigint()
  await Promise.all(sets.map(async (batches) => {
    for (const { sql, values } of batches) await pool.query(sql, values)
  }))
  const secs = Number(process.hrtime.bigint() - t0) / 1e9
  console.log(`  ${name.padEnd(11)} 1000x4 ${Math.round((4*perWriter*size)/secs).toLocaleString().padStart(10)}  (4 parallel writers)`)
  await pool.query('DELETE FROM telematics_logs WHERE trip_id = $1', [tripId])
  await pool.end()
}
console.log()
