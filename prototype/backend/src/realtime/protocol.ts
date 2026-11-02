import { z } from 'zod'
import { AppError } from '../lib/errors.js'

const Coords = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    speed: z.number().min(0).max(400).optional(),
    heading: z.number().min(0).max(360).optional(),
    // Metres, as the phone reports it; and Android's mock-location flag.
    accuracy: z.number().min(0).optional(),
    mocked: z.boolean().optional(),
  })
  .strict()

// Historic names. The driver app sends, in g, the strongest forward
// (braking) reading as accel_z and sideways (swerve) as gyro_z since the
// previous fix, both from the accelerometer.
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
  // Operations console only (Safety Desk roles): the live board and map.
  z.object({ type: z.literal('SUBSCRIBE_OPS'), view: z.enum(['board', 'map']) }).strict(),
  z.object({ type: z.literal('UNSUBSCRIBE_OPS'), view: z.enum(['board', 'map']) }).strict(),
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
  // The driver is at the pickup; the trip is still HANDSHAKE_PENDING.
  z.object({ type: z.literal('DRIVER_ARRIVED'), trip_id: z.string() }),
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
  z.object({ type: z.literal('OPS_SUBSCRIBED'), view: z.string() }),
  z.object({ type: z.literal('OPS_UNSUBSCRIBED'), view: z.string() }),
  // The live board changed; refetch it.
  z.object({ type: z.literal('OPS_CHANGED') }),
  // Every online driver, the same rows as GET /v1/admin/drivers/live.
  z.object({ type: z.literal('DRIVERS_LIVE'), drivers: z.array(z.unknown()) }),
  z.object({ type: z.literal('ERROR'), code: z.string(), message: z.string() }),
  // An integrity warning or SOS (escalation/service.ts announce()). From L3
  // the trip itself is ESCALATED.
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
