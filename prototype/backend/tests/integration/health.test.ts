import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'

describe('health and readiness', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })
  afterAll(async () => { await app.close() })

  it('reports liveness', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok', service: 'mydriver-backend' })
  })

  it('reports readiness only when dependencies answer', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ready' })
  })

  it('exposes Prometheus metrics', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
    for (const metric of [
      'mydriver_ws_connections',
      'mydriver_telemetry_buffer_depth',
      'mydriver_telemetry_dropped_total',
      'mydriver_db_pool_total',
    ]) {
      expect(res.payload).toContain(metric)
    }
  })

  it('returns the standard envelope for an unknown route', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({
      error: { code: 'ROUTE_NOT_FOUND', message: 'No such route' },
    })
  })
})
