import { upsertDriverLocation } from '../modules/trips/geo-index.js'
import { getHub } from '../realtime/hub.js'
import { redis } from '../redis/client.js'
import { getTelemetryWriter } from './batch-writer.js'

export type TelemetryPoint = {
  timestamp: number
  coords: { lat: number; lng: number; speed?: number | undefined; heading?: number | undefined }
  sensors?: { accel_z?: number | undefined; gyro_z?: number | undefined } | undefined
}

/**
 * The one ingest path for a telemetry fix, whether it arrived over the
 * WebSocket or in a background batch over HTTP. `live` marks the newest fix:
 * only that one moves the last-known position, the geo index and the
 * customer's map, so a late-arriving batch never drags the car backwards.
 */
export async function ingestTelemetry(
  tripId: string,
  userId: string,
  source: 'DRIVER' | 'CUSTOMER',
  point: TelemetryPoint,
  live = true,
  // Server-clock time the fix was taken. Staleness is judged on the server's
  // clock: a phone whose clock is a minute off must not look offline.
  seenAt = Date.now(),
): Promise<void> {
  getTelemetryWriter().enqueue({
    time: new Date(point.timestamp),
    tripId,
    source,
    lat: point.coords.lat,
    lng: point.coords.lng,
    speedKmh: point.coords.speed,
    heading: point.coords.heading,
    accelZ: source === 'DRIVER' ? point.sensors?.accel_z : undefined,
    gyroZ: source === 'DRIVER' ? point.sensors?.gyro_z : undefined,
  })
  if (!live) return

  // Last-known position, read by the integrity engine on its 3-second pass.
  // TTL exceeds the staleness window so a dead stream expires.
  await redis.set(
    `trip:{${tripId}}:last:${source === 'DRIVER' ? 'driver' : 'customer'}`,
    JSON.stringify({ lat: point.coords.lat, lng: point.coords.lng, speed: point.coords.speed, at: seenAt }),
    'EX',
    120,
  )

  if (source === 'DRIVER') {
    // Throttled to once per 10s inside upsertDriverLocation.
    await upsertDriverLocation(userId, point.coords)
    await getHub().publish(tripId, {
      type: 'DRIVER_LOCATION',
      trip_id: tripId,
      coords: { lat: point.coords.lat, lng: point.coords.lng, speed: point.coords.speed, heading: point.coords.heading },
    })
  }
}
