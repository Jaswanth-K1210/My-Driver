import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { bearer, loginAs } from '../helpers/auth.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'

describe('current user, guardians and consents', () => {
  let app: FastifyInstance
  let token: string
  let userId: string

  beforeAll(async () => { app = await buildApp(); await app.ready() })
  beforeEach(async () => {
    await resetDb()
    await resetRedis()
    const login = await loginAs(app, '+919876543210', 'CUSTOMER')
    token = login.accessToken
    userId = login.userId
  })
  afterAll(async () => { await app.close() })

  describe('/v1/me', () => {
    it('rejects a request with no token', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/me' })
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('UNAUTHENTICATED')
    })

    it('rejects a malformed token', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/me', headers: bearer('garbage') })
      expect(res.statusCode).toBe(401)
    })

    it('returns the caller identity and the role the token is scoped to', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/me', headers: bearer(token) })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({
        id: userId, role: 'CUSTOMER', phone_number: '+919876543210', roles: ['CUSTOMER'],
      })
    })

    it('updates the display name and email', async () => {
      const res = await app.inject({
        method: 'PATCH', url: '/v1/me', headers: bearer(token),
        payload: { full_name: 'Priya Sharma', email: 'priya@example.com' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ full_name: 'Priya Sharma', email: 'priya@example.com' })
    })

    it('refuses to let a CUSTOMER token reach a DRIVER-only route', async () => {
      const res = await app.inject({
        method: 'POST', url: '/v1/driver/availability',
        headers: bearer(token), payload: { availability: 'ONLINE' },
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('FORBIDDEN_ROLE')
    })
  })

  describe('guardian contacts', () => {
    const add = (payload: unknown, t = token) =>
      app.inject({ method: 'POST', url: '/v1/me/guardians', headers: bearer(t), payload })

    it('starts empty', async () => {
      const res = await app.inject({
        method: 'GET', url: '/v1/me/guardians', headers: bearer(token),
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })

    it('adds a guardian and assigns the next position', async () => {
      const res = await add({ name: 'Rajesh Sharma', relation: 'Father', phone: '+919848012345' })
      expect(res.statusCode).toBe(201)
      expect(res.json()).toMatchObject({
        name: 'Rajesh Sharma', relation: 'Father', phone: '+919848012345', position: 1,
      })
    })

    it('refuses a fourth guardian', async () => {
      await add({ name: 'One', phone: '+919848012341' })
      await add({ name: 'Two', phone: '+919848012342' })
      await add({ name: 'Three', phone: '+919848012343' })

      const res = await add({ name: 'Four', phone: '+919848012344' })
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('GUARDIAN_LIMIT_REACHED')
    })

    it('frees a position when a guardian is deleted', async () => {
      const first = (await add({ name: 'One', phone: '+919848012341' })).json()
      await add({ name: 'Two', phone: '+919848012342' })
      await add({ name: 'Three', phone: '+919848012343' })

      const del = await app.inject({
        method: 'DELETE', url: `/v1/me/guardians/${first.id}`, headers: bearer(token),
      })
      expect(del.statusCode).toBe(204)
      expect((await add({ name: 'Four', phone: '+919848012344' })).statusCode).toBe(201)
    })

    it('updates a guardian in place', async () => {
      const created = (await add({ name: 'One', phone: '+919848012341' })).json()
      const res = await app.inject({
        method: 'PATCH', url: `/v1/me/guardians/${created.id}`,
        headers: bearer(token), payload: { name: 'Meera Sharma', relation: 'Sister' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ name: 'Meera Sharma', relation: 'Sister' })
    })

    it('cannot touch another user guardian', async () => {
      const created = (await add({ name: 'One', phone: '+919848012341' })).json()
      const other = (await loginAs(app, '+919876543299', 'CUSTOMER')).accessToken

      const res = await app.inject({
        method: 'DELETE', url: `/v1/me/guardians/${created.id}`, headers: bearer(other),
      })
      expect(res.statusCode).toBe(404)
    })

    it('rejects a non-E.164 phone number', async () => {
      expect((await add({ name: 'One', phone: '9848012341' })).statusCode).toBe(400)
    })
  })

  describe('DPDP consents', () => {
    const record = (payload: unknown) =>
      app.inject({ method: 'POST', url: '/v1/me/consents', headers: bearer(token), payload })

    it('records a granted consent with its version', async () => {
      const res = await record({
        purpose: 'LOCATION_TRACKING', version: '2026-08-01', granted: true,
      })
      expect(res.statusCode).toBe(201)
      expect(res.json()).toMatchObject({ purpose: 'LOCATION_TRACKING', version: '2026-08-01' })
      expect(res.json().granted_at).toBeTruthy()
      expect(res.json().revoked_at).toBeNull()
    })

    it('revokes by appending a row rather than deleting the grant', async () => {
      await record({ purpose: 'GUARDIAN_SHARING', version: '2026-08-01', granted: true })
      const res = await record({
        purpose: 'GUARDIAN_SHARING', version: '2026-08-01', granted: false,
      })
      expect(res.statusCode).toBe(201)
      expect(res.json().revoked_at).toBeTruthy()

      const list = await app.inject({
        method: 'GET', url: '/v1/me/consents', headers: bearer(token),
      })
      // Both the grant and the revocation are retained: consent is an audit trail.
      expect(list.json()).toHaveLength(2)
    })

    it('rejects an unknown purpose', async () => {
      expect((await record({ purpose: 'SELL_MY_DATA', version: '1', granted: true })).statusCode)
        .toBe(400)
    })

    it('requires authentication', async () => {
      expect((await app.inject({ method: 'GET', url: '/v1/me/consents' })).statusCode).toBe(401)
    })
  })
})
