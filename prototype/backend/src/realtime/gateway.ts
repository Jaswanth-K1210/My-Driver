import fastifyWebsocket from '@fastify/websocket'
import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'
import { pool } from '../db/client.js'
import { counter } from '../lib/metrics.js'
import type { Role } from '../modules/auth/otp.js'
import { upsertDriverLocation } from '../modules/trips/geo-index.js'
import { redis } from '../redis/client.js'
import { getTelemetryWriter } from '../telemetry/batch-writer.js'
import { getHub } from './hub.js'
import { parseClientFrame, type ServerFrame } from './protocol.js'
import { consumeTicket } from './ticket.js'

/** Live count of open sockets on THIS instance. */
let openSockets = 0
export const openSocketCount = (): number => openSockets

export const HEARTBEAT_INTERVAL_MS = 30_000
export const MAX_MISSED_PONGS = 2
export const MAX_FRAMES_PER_SECOND = 1

type Conn = {
  userId: string
  role: Role
  subscriptions: Set<string>
  missedPongs: number
  lastFrameAt: Map<string, number>
}

type TripRoles = { customer_id: string; driver_id: string | null; status: string }

const send = (socket: WebSocket, frame: ServerFrame): void => {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(frame))
}

const fail = (socket: WebSocket, code: string, message: string): void =>
  send(socket, { type: 'ERROR', code, message })

/**
 * Cached for 5 seconds: every telemetry frame would otherwise cost a query.
 * broadcast.ts drops this key on any status change so authorisation never
 * reads stale state.
 */
async function loadTripRoles(tripId: string): Promise<TripRoles | null> {
  const key = `trip:{${tripId}}:roles`

  const cached = await redis.get(key)
  if (cached) return JSON.parse(cached) as TripRoles

  const { rows } = await pool.query<TripRoles>(
    `SELECT customer_id, driver_id, status FROM trips WHERE id = $1`,
    [tripId],
  )
  if (!rows[0]) return null

  await redis.set(key, JSON.stringify(rows[0]), 'EX', 5)
  return rows[0]
}

export async function registerRealtimeGateway(app: FastifyInstance): Promise<void> {
  await app.register(fastifyWebsocket, { options: { maxPayload: 16 * 1024 } })

  const hub = getHub()
  const writer = getTelemetryWriter()

  /**
   * The handler is deliberately NOT async: the 'message' listener must be
   * attached synchronously. The client's `open` event fires as soon as the
   * upgrade is accepted, so frames can arrive while ticket verification is
   * still in flight — anything sent before the listener exists is lost.
   * Frames received during authentication are buffered and drained after.
   */
  app.get('/v1/integrity', { websocket: true }, (socket, request) => {
    const pendingFrames: string[] = []
    let conn: Conn | undefined
    let heartbeat: NodeJS.Timeout | undefined

    socket.on('message', (raw: Buffer) => {
      const text = raw.toString()
      if (!conn) {
        pendingFrames.push(text)
        return
      }
      void handleFrame(text).catch((err) => {
        app.log.error({ err }, 'realtime frame handling failed')
        fail(socket, 'INTERNAL_ERROR', 'Frame could not be processed')
      })
    })

    openSockets++

    socket.on('close', () => {
      openSockets--
      if (heartbeat) clearInterval(heartbeat)
      if (conn) {
        for (const tripId of conn.subscriptions) void hub.unregister(tripId, socket)
      }
    })

    async function handleFrame(raw: string): Promise<void> {
      if (!conn) return

      let frame
      try {
        frame = parseClientFrame(raw)
      } catch {
        return fail(socket, 'INVALID_FRAME', 'Frame could not be parsed')
      }

      if (frame.type === 'PONG') {
        conn.missedPongs = 0
        return
      }

      const trip = await loadTripRoles(frame.trip_id)
      if (!trip) return fail(socket, 'TRIP_NOT_FOUND', 'No such trip')

      const isCustomer = trip.customer_id === conn.userId
      const isDriver = trip.driver_id === conn.userId
      if (!isCustomer && !isDriver) {
        return fail(socket, 'FORBIDDEN_TRIP', 'You are not a participant on this trip')
      }

      if (frame.type === 'SUBSCRIBE') {
        await hub.register(frame.trip_id, socket)
        conn.subscriptions.add(frame.trip_id)
        return send(socket, { type: 'SUBSCRIBED', trip_id: frame.trip_id })
      }

      if (frame.type === 'UNSUBSCRIBE') {
        await hub.unregister(frame.trip_id, socket)
        conn.subscriptions.delete(frame.trip_id)
        return send(socket, { type: 'UNSUBSCRIBED', trip_id: frame.trip_id })
      }

      // Telemetry from here down.
      if (trip.status !== 'IN_TRIP' && trip.status !== 'HANDSHAKE_PENDING') {
        return fail(socket, 'TRIP_NOT_ACTIVE', 'Telemetry is only accepted on an active trip')
      }

      const isDriverFrame = frame.type === 'DRIVER_TELEMETRY'
      if ((isDriverFrame && !isDriver) || (!isDriverFrame && !isCustomer)) {
        return fail(socket, 'WRONG_TELEMETRY_SOURCE', 'Frame type does not match your role')
      }

      // Drop excess frames silently rather than queue them or disconnect.
      const now = Date.now()
      const last = conn.lastFrameAt.get(frame.trip_id) ?? 0
      if (now - last < 1000 / MAX_FRAMES_PER_SECOND) {
        counter('mydriver_telemetry_throttled_total')
        return
      }
      conn.lastFrameAt.set(frame.trip_id, now)

      writer.enqueue({
        time: new Date(frame.timestamp),
        tripId: frame.trip_id,
        source: isDriverFrame ? 'DRIVER' : 'CUSTOMER',
        lat: frame.coords.lat,
        lng: frame.coords.lng,
        speedKmh: frame.coords.speed,
        heading: frame.coords.heading,
        accelZ: frame.type === 'DRIVER_TELEMETRY' ? frame.sensors?.accel_z : undefined,
        gyroZ: frame.type === 'DRIVER_TELEMETRY' ? frame.sensors?.gyro_z : undefined,
      })

      if (isDriverFrame) {
        // Throttled to once per 10s inside upsertDriverLocation.
        await upsertDriverLocation(conn.userId, frame.coords)
        await hub.publish(frame.trip_id, {
          type: 'DRIVER_LOCATION',
          trip_id: frame.trip_id,
          coords: {
            lat: frame.coords.lat,
            lng: frame.coords.lng,
            speed: frame.coords.speed,
            heading: frame.coords.heading,
          },
        })
      }
    }

    void (async () => {
      const ticket = (request.query as { ticket?: string }).ticket
      if (!ticket) return socket.close(4401, 'Missing ticket')

      const identity = await consumeTicket(ticket)
      if (!identity) return socket.close(4401, 'Invalid or expired ticket')

      counter('mydriver_ws_connections_total')

      conn = {
        userId: identity.userId,
        role: identity.role,
        subscriptions: new Set(),
        missedPongs: 0,
        lastFrameAt: new Map(),
      }

      heartbeat = setInterval(() => {
        if (!conn) return
        if (conn.missedPongs >= MAX_MISSED_PONGS) {
          socket.close(4408, 'Heartbeat timeout')
          return
        }
        conn.missedPongs++
        send(socket, { type: 'PING' })
      }, HEARTBEAT_INTERVAL_MS)
      heartbeat.unref()

      // Drain anything that arrived while the ticket was being verified.
      for (const buffered of pendingFrames.splice(0)) {
        await handleFrame(buffered).catch((err) => {
          app.log.error({ err }, 'buffered realtime frame failed')
        })
      }
    })()
  })
}
