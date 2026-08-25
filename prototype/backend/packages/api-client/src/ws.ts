import type { Http } from './http.js'
import type { LatLng, ServerFrame, ServerFrameType } from './types.js'

type Handler = (frame: ServerFrame) => void

export type RealtimeOptions = {
  baseUrl: string
  http: Http
  onStateChange?: (state: 'connecting' | 'open' | 'closed') => void
}

const MAX_BACKOFF_MS = 30_000

/**
 * Wraps the raw WebSocket protocol: ticket exchange, heartbeat replies,
 * reconnect with backoff, and re-subscription after a reconnect.
 */
export class RealtimeConnection {
  private socket: WebSocket | null = null
  private readonly handlers = new Map<ServerFrameType, Set<Handler>>()
  private readonly subscriptions = new Set<string>()
  private attempt = 0
  private closedByCaller = false

  constructor(private readonly opts: RealtimeOptions) {}

  async connect(): Promise<void> {
    this.closedByCaller = false
    this.opts.onStateChange?.('connecting')

    // Tickets are single use, so a fresh one is fetched on every attempt.
    const { ticket } = await this.opts.http.request<{ ticket: string; expires_in: number }>(
      '/v1/realtime/ticket',
      { method: 'POST' },
    )

    const wsUrl = this.opts.baseUrl.replace(/^http/, 'ws')
    const socket = new WebSocket(`${wsUrl}/v1/integrity?ticket=${encodeURIComponent(ticket)}`)
    this.socket = socket

    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => {
        this.attempt = 0
        this.opts.onStateChange?.('open')
        // Restore every subscription the caller had before the drop.
        for (const tripId of this.subscriptions) this.send({ type: 'SUBSCRIBE', trip_id: tripId })
        resolve()
      }
      socket.onerror = () => reject(new Error('WebSocket failed to open'))
    })

    socket.onmessage = (event: MessageEvent) => {
      const frame = JSON.parse(String(event.data)) as ServerFrame
      if (frame.type === 'PING') {
        this.send({ type: 'PONG' })
        return
      }
      for (const handler of this.handlers.get(frame.type) ?? []) handler(frame)
    }

    socket.onclose = () => {
      this.opts.onStateChange?.('closed')
      if (!this.closedByCaller) void this.scheduleReconnect()
    }
  }

  private async scheduleReconnect(): Promise<void> {
    this.attempt++
    const base = Math.min(1000 * 2 ** (this.attempt - 1), MAX_BACKOFF_MS)
    const delay = base + Math.random() * 1000

    await new Promise((resolve) => setTimeout(resolve, delay))
    if (this.closedByCaller) return

    try {
      await this.connect()
    } catch {
      void this.scheduleReconnect()
    }
  }

  private send(frame: unknown): void {
    if (this.socket?.readyState === 1) this.socket.send(JSON.stringify(frame))
  }

  subscribe(tripId: string): void {
    this.subscriptions.add(tripId)
    this.send({ type: 'SUBSCRIBE', trip_id: tripId })
  }

  unsubscribe(tripId: string): void {
    this.subscriptions.delete(tripId)
    this.send({ type: 'UNSUBSCRIBE', trip_id: tripId })
  }

  sendDriverTelemetry(
    tripId: string,
    coords: LatLng & { speed?: number; heading?: number },
    sensors?: { accel_z?: number; gyro_z?: number },
  ): void {
    this.send({
      type: 'DRIVER_TELEMETRY',
      trip_id: tripId,
      timestamp: Date.now(),
      coords,
      ...(sensors ? { sensors } : {}),
    })
  }

  sendCustomerTelemetry(tripId: string, coords: LatLng): void {
    this.send({ type: 'CUSTOMER_TELEMETRY', trip_id: tripId, timestamp: Date.now(), coords })
  }

  on(type: ServerFrameType, handler: Handler): () => void {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(handler)
    return () => set!.delete(handler)
  }

  close(): void {
    this.closedByCaller = true
    this.socket?.close()
    this.socket = null
  }
}
