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

  it('accepts staff sign-in only from the admin console origin', async () => {
    const body = { email: 'nobody@mydriver.test', password: 'x' }
    const fromCustomer = await app.inject({ method: 'POST', url: '/v1/auth/staff/login', headers: { origin: 'http://localhost:5173' }, payload: body })
    expect(fromCustomer.statusCode).toBe(403)
    expect(fromCustomer.json().error.code).toBe('STAFF_SIGNIN_ORIGIN')
    // From the console the request gets through to the credential check.
    const fromAdmin = await app.inject({ method: 'POST', url: '/v1/auth/staff/login', headers: { origin: 'http://localhost:5174' }, payload: body })
    expect(fromAdmin.json().error.code).not.toBe('STAFF_SIGNIN_ORIGIN')
  })

  it('refuses admin API calls made from the customer website', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/admin/stats', headers: { origin: 'http://localhost:5173' } })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('WRONG_SITE')
  })

  it('sends baseline security headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('DENY')
    expect(res.headers['referrer-policy']).toBe('no-referrer')
  })
})
