import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/client.js'
import { seed } from '../../src/db/seed.js'
import { awaitDispatchIdle } from '../../src/modules/trips/dispatch-tracker.js'
import { bearer } from '../helpers/auth.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'
import { loginAsRole } from '../helpers/safety.js'
import { BOOK_BODY, makeCustomer, makeOnlineDriver, SELFIE, type Actor } from '../helpers/trips.js'

describe('driver app: earnings, assessments, profile', () => {
  let app: FastifyInstance
  let customer: Actor
  let driver: Actor

  beforeAll(async () => { app = await buildApp(); await app.ready() })
  afterAll(async () => { await app.close() })
  beforeEach(async () => {
    await resetDb(); await resetRedis(); await seed()
    customer = await makeCustomer(app, '+919822200001')
    driver = await makeOnlineDriver(app, '+919822200002')
  })

  const get = (url: string, actor = driver) =>
    app.inject({ method: 'GET', url, headers: bearer(actor.accessToken) })
  const post = (url: string, actor: Actor, payload?: object) =>
    app.inject({ method: 'POST', url, headers: bearer(actor.accessToken), ...(payload ? { payload } : {}) })

  async function completedTrip(): Promise<string> {
    const tripId = (await post('/v1/trips/book', customer, BOOK_BODY)).json().id as string
    await awaitDispatchIdle()
    await post(`/v1/trips/${tripId}/offer/respond`, driver, { accept: true })
    const otp = (await post(`/v1/trips/${tripId}/handshake-otp`, customer)).json().otp
    await post(`/v1/trips/${tripId}/handshake`, driver, { driver_selfie_base64: SELFIE, otp })
    expect((await post(`/v1/trips/${tripId}/complete`, driver)).statusCode).toBe(200)
    return tripId
  }

  describe('earnings', () => {
    it('is all zeroes, with seven empty days, before the first trip', async () => {
      const res = await get('/v1/driver/earnings')
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.today).toEqual({ earnings: 0, trips: 0 })
      expect(body.daily).toHaveLength(7)
      expect(body.trips).toEqual([])
      expect(body.payouts).toEqual([])
    })

    it('counts a completed trip today, this week and as unsettled', async () => {
      const tripId = await completedTrip()
      const body = (await get('/v1/driver/earnings')).json()
      const earned = body.trips[0].driver_earnings
      expect(body.trips[0]).toMatchObject({ trip_id: tripId, payout_status: null })
      expect(earned).toBeGreaterThan(0)
      expect(body.today).toEqual({ earnings: earned, trips: 1 })
      expect(body.this_week).toEqual({ earnings: earned, trips: 1 })
      expect(body.unsettled).toEqual({ earnings: earned, trips: 1 })
      expect(body.daily.at(-1)).toMatchObject({ trips: 1, earnings: earned })
    })

    it('shows a payout and stops counting its trips as unsettled', async () => {
      const tripId = await completedTrip()
      const { rows } = await pool.query(
        `INSERT INTO driver_payouts (driver_id, period_start, period_end, trip_count, gross, platform_fee, net, status, reference, paid_at)
         VALUES ($1, CURRENT_DATE - 6, CURRENT_DATE, 1, 100, 19, 81, 'PAID', 'UTR123', now()) RETURNING id`,
        [driver.userId],
      )
      await pool.query(`UPDATE trips SET payout_id = $1 WHERE id = $2`, [rows[0].id, tripId])

      const body = (await get('/v1/driver/earnings')).json()
      expect(body.unsettled).toEqual({ earnings: 0, trips: 0 })
      expect(body.trips[0].payout_status).toBe('PAID')
      expect(body.payouts[0]).toMatchObject({ net: 81, status: 'PAID', reference: 'UTR123', trip_count: 1 })
    })

    it('never includes the trips of another driver', async () => {
      await completedTrip()
      const other = await makeOnlineDriver(app, '+919822200003')
      const body = (await get('/v1/driver/earnings', other)).json()
      expect(body.trips).toEqual([])
      expect(body.this_week.trips).toBe(0)
    })
  })

  describe('assessments', () => {
    it('shows the practical test date Ops sets, moves it, and grades it', async () => {
      const ops = await loginAsRole(app, '+919822200099', 'OPS_MANAGER')
      const schedule = (when: string) =>
        post(`/v1/admin/drivers/${driver.userId}/practical`, ops as Actor, { code: 'MD-PRACTICAL-V1', scheduled_at: when })
      const practical = async () =>
        (await get('/v1/driver/assessments')).json().find((a: { code: string }) => a.code === 'MD-PRACTICAL-V1')

      expect((await schedule('2026-11-02T04:30:00.000Z')).statusCode).toBe(200)
      expect((await schedule('2026-11-03T04:30:00.000Z')).statusCode).toBe(200)
      const p = await practical()
      expect(p).toMatchObject({ state: 'SCHEDULED', scheduled_at: '2026-11-03T04:30:00.000Z', attempts_used: 1 })

      // A written test cannot be scheduled.
      const bad = await post(`/v1/admin/drivers/${driver.userId}/practical`, ops as Actor, { code: 'MD-ROAD-RULES-V1', scheduled_at: '2026-11-03T04:30:00.000Z' })
      expect(bad.statusCode).toBe(404)

      const queue = (await get('/v1/admin/attempts/pending', ops as Actor)).json().items
      const attempt = queue.find((a: { code: string }) => a.code === 'MD-PRACTICAL-V1')
      expect(attempt).toBeTruthy()
      expect((await post(`/v1/admin/attempts/${attempt.id}/grade`, ops as Actor, { score: 90 })).statusCode).toBe(200)
      expect(await practical()).toMatchObject({ state: 'PASSED', scheduled_at: null })
      expect((await schedule('2026-11-04T04:30:00.000Z')).statusCode).toBe(409)
    })

    it('lists every active test as not started, without its questions', async () => {
      const res = await get('/v1/driver/assessments')
      expect(res.statusCode).toBe(200)
      const list = res.json()
      expect(list.length).toBeGreaterThan(0)
      expect(list.every((a: { state: string }) => a.state === 'NOT_STARTED')).toBe(true)
      expect(list[0]).not.toHaveProperty('questions')
    })

    it('reports awaiting result, failed with a retry time, and passed', async () => {
      const { rows } = await pool.query<{ id: string; code: string }>(
        `SELECT id, code FROM assessments WHERE active ORDER BY code LIMIT 1`,
      )
      const { id, code } = rows[0]!
      const state = async () =>
        (await get('/v1/driver/assessments')).json().find((a: { code: string }) => a.code === code)

      await pool.query(
        `INSERT INTO assessment_attempts (driver_id, assessment_id, attempt_no, submitted_at) VALUES ($1, $2, 1, now())`,
        [driver.userId, id],
      )
      expect(await state()).toMatchObject({ state: 'AWAITING_RESULT', attempts_used: 1 })

      await pool.query(
        `UPDATE assessment_attempts SET score = 40, passed = false WHERE driver_id = $1`, [driver.userId],
      )
      const failed = await state()
      expect(failed).toMatchObject({ state: 'FAILED', last_score: 40 })
      expect(new Date(failed.retry_at).getTime()).toBeGreaterThan(Date.now())

      await pool.query(
        `INSERT INTO assessment_attempts (driver_id, assessment_id, attempt_no, score, passed, submitted_at)
         VALUES ($1, $2, 2, 90, true, now())`,
        [driver.userId, id],
      )
      expect(await state()).toMatchObject({ state: 'PASSED', last_score: 90, retry_at: null })
    })
  })

  describe('profile', () => {
    it('returns score, badges, Night Shield and the latest of each document', async () => {
      const badge = (await pool.query<{ code: string }>(`SELECT code FROM badges LIMIT 1`)).rows[0]!.code
      await pool.query(`INSERT INTO driver_badges (driver_id, badge_code) VALUES ($1, $2)`, [driver.userId, badge])
      await pool.query(
        `INSERT INTO night_shield_quals (driver_id, expires_at, tenure_days_at_check, score_at_check)
         VALUES ($1, now() + interval '30 days', 200, 92)`,
        [driver.userId],
      )
      await pool.query(
        `INSERT INTO driver_documents (driver_id, kind, storage_key, number_last4, expires_on, status)
         VALUES ($1, 'DRIVING_LICENCE', 'k', '1234', CURRENT_DATE + 20, 'VERIFIED')`,
        [driver.userId],
      )

      const res = await get('/v1/driver/profile')
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.mydriver_score).toBe(100)
      expect(body.badges.map((b: { code: string }) => b.code)).toEqual([badge])
      expect(body.night_shield.status).toBe('ACTIVE')
      expect(body.documents[0]).toMatchObject({ kind: 'DRIVING_LICENCE', status: 'VERIFIED', number_last4: '1234' })
      expect(body.documents[0].expires_on).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('says not qualified when there is no Night Shield record', async () => {
      expect((await get('/v1/driver/profile')).json().night_shield.status).toBe('NOT_QUALIFIED')
    })
  })

  it('refuses a customer token on all three', async () => {
    for (const url of ['/v1/driver/earnings', '/v1/driver/assessments', '/v1/driver/profile']) {
      expect((await get(url, customer)).statusCode).toBe(403)
    }
  })
})
