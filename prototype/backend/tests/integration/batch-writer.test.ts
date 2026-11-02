import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { pool } from '../../src/db/client.js'
import { TelemetryBatchWriter } from '../../src/telemetry/batch-writer.js'
import { resetDb } from '../helpers/db.js'

describe('telemetry batch writer', () => {
  beforeEach(async () => { await resetDb() })

  it('a flush called mid-flush waits, and writes what arrived meanwhile', async () => {
    const writer = new TelemetryBatchWriter()
    const tripId = randomUUID()
    const row = () => ({ time: new Date(), tripId, source: 'DRIVER' as const, lat: 17.44, lng: 78.38 })

    writer.enqueue(row())
    const first = writer.flush()
    // Arrives while the first INSERT is in flight, as the last fix of a trip does.
    writer.enqueue(row())
    await writer.flush()

    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM telematics_logs WHERE trip_id = $1`, [tripId])
    expect(rows[0].n).toBe(2)
    await first
  })
})
