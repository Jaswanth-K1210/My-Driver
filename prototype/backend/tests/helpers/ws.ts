import type { FastifyInstance } from 'fastify'
import WebSocket from 'ws'
import type { ServerFrame } from '../../src/realtime/protocol.js'

export async function connectWs(app: FastifyInstance, ticket: string): Promise<WebSocket> {
  const address = app.server.address()
  if (!address || typeof address === 'string') throw new Error('app is not listening')

  const ws = new WebSocket(`ws://127.0.0.1:${address.port}/v1/integrity?ticket=${ticket}`)
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('error', reject)
  })
  return ws
}

/** Expect the connection to be refused; resolves with the close code. */
export async function expectWsRejected(app: FastifyInstance, ticket: string): Promise<number> {
  const address = app.server.address()
  if (!address || typeof address === 'string') throw new Error('app is not listening')

  const ws = new WebSocket(`ws://127.0.0.1:${address.port}/v1/integrity?ticket=${ticket}`)
  return new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('socket was not closed')), 5_000)
    ws.once('close', (code) => {
      clearTimeout(timer)
      resolve(code)
    })
    ws.once('error', () => undefined)
  })
}

/** Resolve with the next frame, answering and ignoring server heartbeats. */
export function nextFrame(ws: WebSocket, timeoutMs = 5_000): Promise<ServerFrame> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage)
      reject(new Error('timed out waiting for a frame'))
    }, timeoutMs)

    function onMessage(raw: Buffer): void {
      const frame = JSON.parse(raw.toString()) as ServerFrame
      if (frame.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }))
        return
      }
      clearTimeout(timer)
      ws.off('message', onMessage)
      resolve(frame)
    }

    ws.on('message', onMessage)
  })
}

/** Wait for a specific frame type, skipping others. */
export function waitForFrame(
  ws: WebSocket,
  type: ServerFrame['type'],
  timeoutMs = 5_000,
): Promise<ServerFrame> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage)
      reject(new Error(`timed out waiting for ${type}`))
    }, timeoutMs)

    function onMessage(raw: Buffer): void {
      const frame = JSON.parse(raw.toString()) as ServerFrame
      if (frame.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }))
        return
      }
      if (frame.type !== type) return
      clearTimeout(timer)
      ws.off('message', onMessage)
      resolve(frame)
    }

    ws.on('message', onMessage)
  })
}

export const sendFrame = (ws: WebSocket, frame: unknown): void => ws.send(JSON.stringify(frame))

export const closeWs = (ws: WebSocket): Promise<void> =>
  new Promise((resolve) => {
    if (ws.readyState === ws.CLOSED) return resolve()
    ws.once('close', () => resolve())
    ws.close()
  })
