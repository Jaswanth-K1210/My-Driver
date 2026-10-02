import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/client.js'
import { ConsoleSmsProvider, setSmsProvider } from '../../src/providers/sms/index.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'

/**
 * grant-role.ts states the rule plainly: privileged roles are not grantable
 * over the API, because a login endpoint that grants whatever role it is asked
 * for is a privilege-escalation surface.
 *
 * These tests are what makes that true rather than merely intended. Without
 * them, anyone who knows the endpoint shape could POST role: 'SUPER_ADMIN' and
 * be granted it.
 */
describe('privileged roles are not self-service', () => {
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
    await app.close()
  })

  async function otpFor(phone: string, role: string): Promise<string> {
    sms.clear()
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: { phone_number: phone, role },
    })
    expect(res.statusCode).toBe(200)
    return sms.sent[0]!.body.match(/\b(\d{6})\b/)![1]!
  }

  const verify = (phone: string, otp: string, role: string) =>
    app.inject({
      method: 'POST',
      url: '/v1/auth/otp/verify',
      payload: { phone_number: phone, otp, role },
    })

  for (const role of ['SAFETY_DESK_AGENT', 'OPS_MANAGER', 'FINANCE', 'SUPER_ADMIN', 'ADMIN']) {
    it(`refuses to mint a ${role} session for an account that was never granted it`, async () => {
      const phone = '+919000000001'
      const otp = await otpFor(phone, role)

      const res = await verify(phone, otp, role)

      expect(res.statusCode).toBe(403)
      expect(res.json().error.code).toBe('ROLE_NOT_GRANTED')

      // The decisive assertion: no role row was written. A 403 that still
      // granted the role would be worse than no check at all.
      const { rows } = await pool.query(
        `SELECT r.role FROM user_roles r
           JOIN users u ON u.id = r.user_id
          WHERE u.phone_number = $1`,
        [phone],
      )
      expect(rows).toHaveLength(0)
    })
  }

  it('still lets a provisioned operator sign in to their granted role', async () => {
    const phone = '+919000000002'

    // Provisioned the only way a privileged role may be: out of band.
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO users (phone_number, phone_verified_at) VALUES ($1, now()) RETURNING id`,
      [phone],
    )
    await pool.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'SAFETY_DESK_AGENT')`, [
      rows[0]!.id,
    ])

    const otp = await otpFor(phone, 'SAFETY_DESK_AGENT')
    const res = await verify(phone, otp, 'SAFETY_DESK_AGENT')

    expect(res.statusCode).toBe(200)
    expect(res.json().user.role).toBe('SAFETY_DESK_AGENT')

    // And that session actually opens the desk.
    const board = await app.inject({
      method: 'GET',
      url: '/v1/admin/stats',
      headers: { authorization: `Bearer ${res.json().access_token}` },
    })
    expect(board.statusCode).toBe(200)
  })

  for (const role of ['CUSTOMER', 'DRIVER']) {
    it(`still allows self-service sign-up as ${role}`, async () => {
      const phone = '+919000000003'
      const otp = await otpFor(phone, role)
      const res = await verify(phone, otp, role)

      expect(res.statusCode).toBe(200)
      expect(res.json().user.role).toBe(role)
    })
  }
})
