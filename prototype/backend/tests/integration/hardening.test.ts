import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'

describe('production hardening', () => {
  let app: FastifyInstance
  beforeAll(async () => { app = await buildApp(); await app.ready() })
  afterAll(async () => { await app.close() })

  it('reports malformed JSON as a 400, not a 500', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/auth/otp/request',
      headers: { 'content-type': 'application/json' }, payload: '{"phone_number":',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).not.toBe('INTERNAL_ERROR')
  })

  it('reports an oversized body as a 413', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/auth/otp/request',
      headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ x: 'a'.repeat(1.2 * 1024 * 1024) }),
    })
    expect(res.statusCode).toBe(413)
  })

  it('sends baseline security headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('DENY')
    expect(res.headers['referrer-policy']).toBe('no-referrer')
  })
})
