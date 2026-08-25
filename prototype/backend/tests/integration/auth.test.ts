import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/client.js'
import { setGoogleVerifier } from '../../src/modules/auth/google.js'
import { ConsoleSmsProvider, setSmsProvider } from '../../src/providers/sms/index.js'
import { bearer, loginAs } from '../helpers/auth.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'

describe('authentication', () => {
  let app: FastifyInstance
  let sms: ConsoleSmsProvider

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })
  beforeEach(async () => {
    await resetDb()
    await resetRedis()
    sms = new ConsoleSmsProvider()
    setSmsProvider(sms)
  })
  afterAll(async () => {
    setSmsProvider(undefined)
    setGoogleVerifier(undefined)
    await app.close()
  })

  const request = (payload: unknown) =>
    app.inject({ method: 'POST', url: '/v1/auth/otp/request', payload })
  const verify = (payload: unknown) =>
    app.inject({ method: 'POST', url: '/v1/auth/otp/verify', payload })

  async function sendOtp(phone = '+919876543210', role = 'CUSTOMER'): Promise<string> {
    sms.clear()
    await request({ phone_number: phone, role })
    return sms.sent[0]!.body.match(/\b(\d{6})\b/)![1]!
  }

  describe('POST /v1/auth/otp/request', () => {
    it('sends a 6-digit code and reports the TTL', async () => {
      const res = await request({ phone_number: '+919876543210', role: 'CUSTOMER' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ status: 'OTP_SENT', expires_in: 300 })
      expect(sms.sent).toHaveLength(1)
      expect(sms.sent[0]!.body).toMatch(/\b\d{6}\b/)
    })

    it('stores the code hashed, never in plaintext', async () => {
      await request({ phone_number: '+919876543210', role: 'CUSTOMER' })
      const code = sms.sent[0]!.body.match(/\b(\d{6})\b/)![1]!

      const { rows } = await pool.query('SELECT code_hash FROM otp_challenges')
      expect(rows).toHaveLength(1)
      expect(rows[0].code_hash).not.toContain(code)
      expect(rows[0].code_hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('rejects a malformed phone number', async () => {
      const res = await request({ phone_number: '9876543210', role: 'CUSTOMER' })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('VALIDATION_FAILED')
    })

    it('rejects an unknown role', async () => {
      expect((await request({ phone_number: '+919876543210', role: 'PILOT' })).statusCode).toBe(400)
    })

    it('allows exactly 3 requests per phone per window, then 429s', async () => {
      for (let i = 0; i < 3; i++) {
        expect((await request({ phone_number: '+919876543211', role: 'CUSTOMER' })).statusCode)
          .toBe(200)
      }
      const denied = await request({ phone_number: '+919876543211', role: 'CUSTOMER' })
      expect(denied.statusCode).toBe(429)
      expect(denied.json().error.code).toBe('OTP_RATE_LIMITED')
      expect(sms.sent).toHaveLength(3)
    })

    it('invalidates any previous unconsumed challenge for the same phone', async () => {
      await request({ phone_number: '+919876543212', role: 'CUSTOMER' })
      await request({ phone_number: '+919876543212', role: 'CUSTOMER' })

      const { rows } = await pool.query(
        `SELECT count(*)::int AS live FROM otp_challenges
          WHERE phone_number = '+919876543212' AND consumed_at IS NULL AND expires_at > now()`,
      )
      expect(rows[0].live).toBe(1)
    })
  })

  describe('POST /v1/auth/otp/verify', () => {
    it('creates the user, grants the role, and returns tokens', async () => {
      const code = await sendOtp()
      const res = await verify({ phone_number: '+919876543210', otp: code, role: 'CUSTOMER' })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.access_token).toBeTruthy()
      expect(body.refresh_token).toBeTruthy()
      expect(body.user.role).toBe('CUSTOMER')
      expect(body.user.phone_number).toBe('+919876543210')

      const { rows } = await pool.query('SELECT role FROM user_roles')
      expect(rows.map((r) => r.role)).toEqual(['CUSTOMER'])
    })

    it('marks the phone number verified', async () => {
      const code = await sendOtp()
      await verify({ phone_number: '+919876543210', otp: code, role: 'CUSTOMER' })
      const { rows } = await pool.query('SELECT phone_verified_at FROM users')
      expect(rows[0].phone_verified_at).not.toBeNull()
    })

    it('grants a second role to the same phone without creating a second user', async () => {
      const first = await sendOtp('+919876543210', 'CUSTOMER')
      await verify({ phone_number: '+919876543210', otp: first, role: 'CUSTOMER' })

      const second = await sendOtp('+919876543210', 'DRIVER')
      const res = await verify({ phone_number: '+919876543210', otp: second, role: 'DRIVER' })

      expect(res.statusCode).toBe(200)
      expect(res.json().user.role).toBe('DRIVER')

      expect((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(1)
      const roles = await pool.query('SELECT role FROM user_roles ORDER BY role')
      expect(roles.rows.map((r) => r.role)).toEqual(['CUSTOMER', 'DRIVER'])
    })

    it('rejects a wrong code and counts the attempt', async () => {
      await sendOtp()
      const res = await verify({ phone_number: '+919876543210', otp: '000000', role: 'CUSTOMER' })

      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('INVALID_OTP')
      expect((await pool.query('SELECT attempts FROM otp_challenges')).rows[0].attempts).toBe(1)
    })

    it('locks the challenge after 5 failed attempts', async () => {
      const code = await sendOtp()
      for (let i = 0; i < 5; i++) {
        await verify({ phone_number: '+919876543210', otp: '000000', role: 'CUSTOMER' })
      }
      const res = await verify({ phone_number: '+919876543210', otp: code, role: 'CUSTOMER' })
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('OTP_ATTEMPTS_EXHAUSTED')
    })

    it('refuses to reuse a consumed code', async () => {
      const code = await sendOtp()
      await verify({ phone_number: '+919876543210', otp: code, role: 'CUSTOMER' })

      const res = await verify({ phone_number: '+919876543210', otp: code, role: 'CUSTOMER' })
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('INVALID_OTP')
    })

    it('refuses a code issued for a different role', async () => {
      const code = await sendOtp('+919876543210', 'CUSTOMER')
      const res = await verify({ phone_number: '+919876543210', otp: code, role: 'DRIVER' })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('tokens', () => {
    it('stores the refresh token hashed, never in plaintext', async () => {
      const { refreshToken } = await loginAs(app, '+919876543210', 'CUSTOMER')
      const { rows } = await pool.query('SELECT token_hash FROM refresh_tokens')
      expect(rows[0].token_hash).not.toBe(refreshToken)
      expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('exchanges a refresh token for a new, usable pair', async () => {
      const { refreshToken } = await loginAs(app, '+919876543210', 'CUSTOMER')

      const res = await app.inject({
        method: 'POST', url: '/v1/auth/refresh', payload: { refresh_token: refreshToken },
      })
      expect(res.statusCode).toBe(200)
      const next = res.json()
      expect(next.refresh_token).not.toBe(refreshToken)
      expect(next.expires_in).toBe(900)

      const me = await app.inject({ method: 'GET', url: '/v1/me', headers: bearer(next.access_token) })
      expect(me.statusCode).toBe(200)
      expect(me.json().role).toBe('CUSTOMER')
    })

    it('revokes the whole chain when a consumed token is replayed', async () => {
      const { refreshToken } = await loginAs(app, '+919876543210', 'CUSTOMER')
      const second = (await app.inject({
        method: 'POST', url: '/v1/auth/refresh', payload: { refresh_token: refreshToken },
      })).json()

      const replay = await app.inject({
        method: 'POST', url: '/v1/auth/refresh', payload: { refresh_token: refreshToken },
      })
      expect(replay.statusCode).toBe(401)
      expect(replay.json().error.code).toBe('REFRESH_TOKEN_REUSED')

      // The legitimately-rotated token is now dead too.
      const after = await app.inject({
        method: 'POST', url: '/v1/auth/refresh', payload: { refresh_token: second.refresh_token },
      })
      expect(after.statusCode).toBe(401)
    })

    it('logout revokes the refresh token, and is a no-op for an unknown one', async () => {
      const { refreshToken } = await loginAs(app, '+919876543210', 'CUSTOMER')

      const out = await app.inject({
        method: 'POST', url: '/v1/auth/logout', payload: { refresh_token: refreshToken },
      })
      expect(out.statusCode).toBe(204)

      const res = await app.inject({
        method: 'POST', url: '/v1/auth/refresh', payload: { refresh_token: refreshToken },
      })
      expect(res.statusCode).toBe(401)

      const unknown = await app.inject({
        method: 'POST', url: '/v1/auth/logout', payload: { refresh_token: 'nope.nope' },
      })
      expect(unknown.statusCode).toBe(204)
    })
  })

  describe('POST /v1/auth/google', () => {
    const google = (payload: unknown) =>
      app.inject({ method: 'POST', url: '/v1/auth/google', payload })

    const stub = (identity: {
      sub: string; email: string | null; emailVerified: boolean; name: string | null
    }) => setGoogleVerifier(async () => identity)

    it('creates a phone-less user on first Google sign-in', async () => {
      stub({ sub: 'g-1', email: 'priya@example.com', emailVerified: true, name: 'Priya' })
      const res = await google({ id_token: 'stub', role: 'CUSTOMER' })

      expect(res.statusCode).toBe(200)
      expect(res.json().user).toMatchObject({
        role: 'CUSTOMER', phone_number: null, email: 'priya@example.com', full_name: 'Priya',
      })
    })

    it('returns the same user on a second sign-in with the same sub', async () => {
      stub({ sub: 'g-1', email: 'priya@example.com', emailVerified: true, name: 'Priya' })
      const first = (await google({ id_token: 'stub', role: 'CUSTOMER' })).json()
      const second = (await google({ id_token: 'stub', role: 'CUSTOMER' })).json()

      expect(second.user.id).toBe(first.user.id)
      expect((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(1)
    })

    it('links to an existing user when the verified email matches', async () => {
      const { userId, accessToken } = await loginAs(app, '+919876543210', 'CUSTOMER')
      await app.inject({
        method: 'PATCH', url: '/v1/me',
        headers: bearer(accessToken), payload: { email: 'priya@example.com' },
      })

      stub({ sub: 'g-2', email: 'priya@example.com', emailVerified: true, name: 'Priya' })
      const res = await google({ id_token: 'stub', role: 'CUSTOMER' })

      expect(res.json().user.id).toBe(userId)
      expect(res.json().user.phone_number).toBe('+919876543210')
      expect((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(1)
    })

    it('does NOT link when the email is unverified', async () => {
      const { accessToken } = await loginAs(app, '+919876543210', 'CUSTOMER')
      await app.inject({
        method: 'PATCH', url: '/v1/me',
        headers: bearer(accessToken), payload: { email: 'priya@example.com' },
      })

      stub({ sub: 'g-3', email: 'priya@example.com', emailVerified: false, name: null })
      expect((await google({ id_token: 'stub', role: 'CUSTOMER' })).statusCode).toBe(200)
      expect((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(2)
    })

    it('returns 401 when token verification fails', async () => {
      setGoogleVerifier(async () => { throw new Error('bad signature') })
      const res = await google({ id_token: 'stub', role: 'CUSTOMER' })
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('INVALID_GOOGLE_TOKEN')
    })
  })
})
