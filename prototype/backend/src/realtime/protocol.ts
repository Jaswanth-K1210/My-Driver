import { z } from 'zod'
import { AppError } from '../lib/errors.js'

const Coords = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    speed: z.number().min(0).max(400).optional(),
    heading: z.number().min(0).max(360).optional(),
  })
  .strict()

const Sensors = z
  .object({ accel_z: z.number().optional(), gyro_z: z.number().optional() })
  .strict()

export const ClientFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SUBSCRIBE'), trip_id: z.string().uuid() }).strict(),
  z.object({ type: z.literal('UNSUBSCRIBE'), trip_id: z.string().uuid() }).strict(),
  z
    .object({
      type: z.literal('DRIVER_TELEMETRY'),
      trip_id: z.string().uuid(),
      timestamp: z.number().int().positive(),
      coords: Coords,
      sensors: Sensors.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('CUSTOMER_TELEMETRY'),
      trip_id: z.string().uuid(),
      timestamp: z.number().int().positive(),
      coords: Coords,
    })
    .strict(),
  z.object({ type: z.literal('PONG') }).strict(),
])

export const ServerFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SUBSCRIBED'), trip_id: z.string() }),
  z.object({ type: z.literal('UNSUBSCRIBED'), trip_id: z.string() }),
  z.object({
    type: z.literal('TRIP_OFFER'),
    trip_id: z.string(),
    expires_at: z.string(),
    pickup: z.object({ lat: z.number(), lng: z.number() }),
    fare_estimate: z.number().nullable(),
  }),
  z.object({ type: z.literal('TRIP_STATE_CHANGED'), trip_id: z.string(), status: z.string() }),
  z.object({
    type: z.literal('DRIVER_LOCATION'),
    trip_id: z.string(),
    coords: z.object({
      lat: z.number(),
      lng: z.number(),
      speed: z.number().optional(),
      heading: z.number().optional(),
    }),
  }),
  z.object({ type: z.literal('PING') }),
  z.object({ type: z.literal('ERROR'), code: z.string(), message: z.string() }),
  // Reserved for Phase 2. Documented now so clients can switch on it safely.
  z.object({
    type: z.literal('ANOMALY_TRIGGERED'),
    trip_id: z.string(),
    level: z.string(),
    reason: z.string(),
    deviation_distance_meters: z.number().optional(),
  }),
])

export type ClientFrame = z.infer<typeof ClientFrameSchema>
export type ServerFrame = z.infer<typeof ServerFrameSchema>

export function parseClientFrame(raw: string): ClientFrame {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new AppError(400, 'INVALID_FRAME', 'Frame is not valid JSON')
  }

  const parsed = ClientFrameSchema.safeParse(json)
  if (!parsed.success) {
    throw new AppError(400, 'INVALID_FRAME', 'Frame did not match any known message type')
  }
  return parsed.data
}
