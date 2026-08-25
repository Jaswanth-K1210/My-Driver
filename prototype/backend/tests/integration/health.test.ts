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

describe('CORS and public catalogue', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
    const { resetDb } = await import('../helpers/db.js')
    const { seed } = await import('../../src/db/seed.js')
    const { resetRedis } = await import('../helpers/redis.js')
    await resetDb()
    await resetRedis()
    await seed()
  })
  afterAll(async () => { await app.close() })

  it('allows a cross-origin request from the website dev server', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/v1/auth/otp/request',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    })
    expect(res.statusCode).toBeLessThan(300)
    expect(res.headers['access-control-allow-origin']).toBeTruthy()
  })

  it('permits the idempotency-key request header', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/v1/trips/book',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'idempotency-key',
      },
    })
    expect(String(res.headers['access-control-allow-headers'])).toContain('idempotency-key')
  })

  it('serves the rate card catalogue without authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/rate-cards' })
    expect(res.statusCode).toBe(200)

    const cards = res.json()
    expect(cards).toHaveLength(5)
    const standard = cards.find((c: { skill_id: string }) => c.skill_id === 'MD-Standard')
    expect(standard.per_km_rate).toBe(16)
    expect(standard.hourly_rate).toBe(240)
  })
})
