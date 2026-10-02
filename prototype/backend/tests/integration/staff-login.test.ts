import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/client.js'
import { hashPassword } from '../../src/lib/password.js'
import { bearer } from '../helpers/auth.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'
import { auditActions, loginAsRole } from '../helpers/safety.js'
import { HITEC_CITY, makeOnlineDriver } from '../helpers/trips.js'

/** Operators have no signup: an account exists only if seed-staff made it. */
async function provision(email: string, password: string, role: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, full_name, password_hash) VALUES ($1, 'Op', $2) RETURNING id`,
    [email, await hashPassword(password)],
  )
  await pool.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, $2::user_role)`, [
    rows[0]!.id,
    role,
  ])
  return rows[0]!.id
}

describe('staff password login and live driver map', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })
  beforeEach(async () => {
    await resetDb()
    await resetRedis()
  })
  afterAll(async () => {
    await app.close()
  })

  const login = (email: string, password: string) =>
    app.inject({ method: 'POST', url: '/v1/auth/staff/login', payload: { email, password } })

  it('signs a provisioned operator in with their role, and audits it', async () => {
    await provision('ops@mydriver.test', 'correct horse', 'OPS_MANAGER')

    const res = await login('OPS@mydriver.test', 'correct horse')
    expect(res.statusCode).toBe(200)
    expect(res.json().user.role).toBe('OPS_MANAGER')
    expect(await auditActions()).toContain('STAFF_LOGIN')
  })

  it('gives one answer for wrong password, unknown email, and customer-only accounts', async () => {
    await provision('desk@mydriver.test', 'right', 'SAFETY_DESK_AGENT')
    await provision('cust@mydriver.test', 'right', 'CUSTOMER')

    for (const [email, pw] of [
      ['desk@mydriver.test', 'wrong'],
      ['nobody@mydriver.test', 'right'],
      ['cust@mydriver.test', 'right'],
    ]) {
      const res = await login(email!, pw!)
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('INVALID_CREDENTIALS')
    }
  })

  it('locks out an email after five failed attempts', async () => {
    await provision('fin@mydriver.test', 'right', 'FINANCE')
    for (let i = 0; i < 5; i++) await login('fin@mydriver.test', 'wrong')
    expect((await login('fin@mydriver.test', 'right')).statusCode).toBe(429)
  })

  it('shows online drivers on the live map to the desk, not to finance', async () => {
    const driver = await makeOnlineDriver(app, '+919100000001', HITEC_CITY)
    const desk = await loginAsRole(app, '+919100000002', 'SAFETY_DESK_AGENT')
    const fin = await loginAsRole(app, '+919100000003', 'FINANCE')

    const res = await app.inject({
      method: 'GET', url: '/v1/admin/drivers/live', headers: bearer(desk.accessToken),
    })
    expect(res.statusCode).toBe(200)
    const [pin] = res.json()
    expect(pin.driver_id).toBe(driver.userId)
    expect(pin.lat).toBeCloseTo(HITEC_CITY.lat, 3)
    expect(await auditActions()).toContain('VIEW_DRIVER_MAP')

    const denied = await app.inject({
      method: 'GET', url: '/v1/admin/drivers/live', headers: bearer(fin.accessToken),
    })
    expect(denied.statusCode).toBe(403)
  })
})
