import { pool } from '../db/client.js'
import type { LatLng } from '../lib/geo.js'

export const FLUSH_INTERVAL_MS = 2_000
export const FLUSH_ROW_COUNT = 100
export const MAX_BUFFER_ROWS = 10_000

export type TelemetrySource = 'DRIVER' | 'CUSTOMER'

export type TelemetryRow = {
  time: Date
  tripId: string
  source: TelemetrySource
  lat: number
  lng: number
  speedKmh?: number | undefined
  heading?: number | undefined
  accelZ?: number | undefined
  gyroZ?: number | undefined
}

/**
 * Buffers telemetry and writes it in multi-row INSERTs. Per-row INSERT is
 * impossible at ~133k frames/second; batching turns that into ~1,330
 * statements/second across the cluster.
 *
 * Above roughly 50k rows/second on a single-node TimescaleDB this must be fed
 * from a durable stream (Kafka / NATS / Redis Streams) instead of an in-process
 * buffer. The `dropped` counter is the signal that the threshold was crossed.
 */
export class TelemetryBatchWriter {
  private buffer: TelemetryRow[] = []
  private timer: NodeJS.Timeout | undefined
  private flushing = false

  private droppedCount = 0
  private writtenCount = 0

  get depth(): number {
    return this.buffer.length
  }
  get dropped(): number {
    return this.droppedCount
  }
  get written(): number {
    return this.writtenCount
  }

  enqueue(row: TelemetryRow): void {
    if (this.buffer.length >= MAX_BUFFER_ROWS) {
      // Shed load rather than exhaust memory. Newest data is the useful data.
      this.buffer.shift()
      this.droppedCount++
    }
    this.buffer.push(row)
    if (this.buffer.length >= FLUSH_ROW_COUNT) void this.flush().catch(() => undefined)
  }

  async flush(): Promise<number> {
    if (this.flushing || this.buffer.length === 0) return 0
    this.flushing = true

    const batch = this.buffer
    this.buffer = []

    try {
      const values: unknown[] = []
      const tuples = batch.map((r, i) => {
        const b = i * 9
        values.push(
          r.time,
          r.tripId,
          r.source,
          r.lat,
          r.lng,
          r.speedKmh ?? null,
          r.heading ?? null,
          r.accelZ ?? null,
          r.gyroZ ?? null,
        )
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`
      })

      await pool.query(
        `INSERT INTO telematics_logs
           (time, trip_id, source, lat, lng, speed_kmh, heading, accel_z, gyro_z)
         VALUES ${tuples.join(',')}`,
        values,
      )

      this.writtenCount += batch.length
      return batch.length
    } catch (err) {
      // Put the rows back so a transient database blip does not lose data.
      this.buffer = batch.concat(this.buffer).slice(-MAX_BUFFER_ROWS)
      throw err
    } finally {
      this.flushing = false
    }
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.flush().catch((err) => console.error('telemetry flush failed', err))
    }, FLUSH_INTERVAL_MS)
    this.timer.unref()
  }

  /** Shutdown drains. Never discard buffered rows. */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    while (this.buffer.length > 0) await this.flush()
  }
}

let writer: TelemetryBatchWriter | undefined

export function getTelemetryWriter(): TelemetryBatchWriter {
  if (!writer) {
    writer = new TelemetryBatchWriter()
    writer.start()
  }
  return writer
}

export async function readTripTrack(tripId: string): Promise<LatLng[]> {
  const { rows } = await pool.query<LatLng>(
    `SELECT lat, lng FROM telematics_logs
      WHERE trip_id = $1 AND source = 'DRIVER'
      ORDER BY time ASC`,
    [tripId],
  )
  return rows
}
