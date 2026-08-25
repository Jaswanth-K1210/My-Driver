import type { WebSocket } from 'ws'
import { createSubscriber, redis, type RedisClient } from '../redis/client.js'
import type { ServerFrame } from './protocol.js'

/**
 * The hash tag braces are load-bearing: in Redis Cluster, `trip:{id}` and any
 * other key using the same tag hash to the same slot, so a trip's channel and
 * its cached state live on one shard.
 */
export const tripChannel = (tripId: string): string => `trip:{${tripId}}`

const MAX_OUTBOUND_BUFFER_BYTES = 1_048_576 // 1 MB

export class Hub {
  /** Process-local only. Cross-instance delivery always goes via Redis. */
  private readonly rooms = new Map<string, Set<WebSocket>>()
  private subscriber: RedisClient | undefined
  private wired = false

  private ensureSubscriber(): RedisClient {
    if (!this.subscriber) this.subscriber = createSubscriber()
    if (!this.wired) {
      this.wired = true
      this.subscriber.on('message', (channel: string, message: string) => {
        const sockets = this.rooms.get(channel)
        if (!sockets) return
        for (const socket of sockets) this.deliver(socket, message)
      })
    }
    return this.subscriber
  }

  /** A slow consumer is disconnected, never buffered indefinitely. */
  private deliver(socket: WebSocket, message: string): void {
    if (socket.bufferedAmount > MAX_OUTBOUND_BUFFER_BYTES) {
      socket.close(1013, 'Client too slow')
      return
    }
    if (socket.readyState === socket.OPEN) socket.send(message)
  }

  async register(tripId: string, socket: WebSocket): Promise<void> {
    const sub = this.ensureSubscriber()
    const channel = tripChannel(tripId)

    let room = this.rooms.get(channel)
    if (!room) {
      room = new Set()
      this.rooms.set(channel, room)
      await sub.subscribe(channel)
    }
    room.add(socket)
  }

  async unregister(tripId: string, socket: WebSocket): Promise<void> {
    const channel = tripChannel(tripId)
    const room = this.rooms.get(channel)
    if (!room) return

    room.delete(socket)
    if (room.size === 0) {
      this.rooms.delete(channel)
      if (this.subscriber) await this.subscriber.unsubscribe(channel)
    }
  }

  /** Delivers to every instance holding a subscriber for this trip. */
  async publish(tripId: string, frame: ServerFrame): Promise<void> {
    await redis.publish(tripChannel(tripId), JSON.stringify(frame))
  }

  localSocketCount(): number {
    let n = 0
    for (const room of this.rooms.values()) n += room.size
    return n
  }

  async close(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit()
      this.subscriber = undefined
      this.wired = false
    }
    this.rooms.clear()
  }
}

let hub: Hub | undefined

export function getHub(): Hub {
  if (!hub) hub = new Hub()
  return hub
}
