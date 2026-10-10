import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/client.js'
import { seed } from '../../src/db/seed.js'
import { MOCK_AADHAAR_OTP } from '../../src/providers/kyc/index.js'
import { bearer, loginAs } from '../helpers/auth.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'
import { loginAsRole } from '../helpers/safety.js'

// Smallest valid JPEG header; uploadDocument sniffs the magic bytes.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).toString('base64')

describe('KYC and the driver approval gate', () => {
  let app: FastifyInstance
  let driver: { userId: string; accessToken: string }
  let ops: { userId: string; accessToken: string }

  beforeAll(async () => { app = await buildApp(); await app.ready() })
  beforeEach(async () => {
    await resetDb(); await resetRedis(); await seed()
    driver = await loginAs(app, '+919811111111', 'DRIVER')
    ops = await loginAsRole(app, '+919822222222', 'OPS_MANAGER')
  })
  afterAll(async () => { await app.close() })

  const post = (url: string, payload: unknown, token = driver.accessToken) =>
    app.inject({ method: 'POST', url, headers: bearer(token), payload })

  const verifyPan = () => post('/v1/kyc/pan', { pan: 'abcpe1234f', name: 'Ravi Kumar' })
  async function verifyAadhaar() {
    const otp = await post('/v1/kyc/aadhaar/otp', { aadhaar: '2345 6789 0123' })
    return post('/v1/kyc/aadhaar/verify', { ref_id: otp.json().ref_id, otp: MOCK_AADHAAR_OTP })
  }
  const uploadLicence = () =>
    post('/v1/driver/documents', { kind: 'DRIVING_LICENCE', file_base64: JPEG, number_last4: '4321' })
  const approve = () => post(`/v1/admin/drivers/${driver.userId}/status`, { status: 'APPROVED' }, ops.accessToken)

  it('verifies a PAN and stores only the last four characters', async () => {
    const res = await verifyPan()
    expect(res.statusCode).toBe(200)
    expect(res.json().pan).toMatchObject({ status: 'VERIFIED', last4: '234F' })

    const { rows } = await pool.query(`SELECT row_to_json(k)::text AS j FROM kyc_verifications k`)
    expect(rows[0].j).not.toContain('ABCPE1234F')
  })

  it('rejects a malformed PAN before calling the provider', async () => {
    const res = await post('/v1/kyc/pan', { pan: 'NOTAPAN123', name: 'Ravi Kumar' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('INVALID_PAN')
  })

  it('records a failed PAN check and returns 422', async () => {
    // The mock treats a non-'P' fourth letter as a non-individual PAN.
    const res = await post('/v1/kyc/pan', { pan: 'ABCCE1234F', name: 'Ravi Kumar' })
    expect(res.statusCode).toBe(422)
    const { rows } = await pool.query(`SELECT status FROM kyc_verifications`)
    expect(rows[0].status).toBe('FAILED')
  })

  it('runs the Aadhaar OTP flow, and a wrong OTP leaves it retryable', async () => {
    const otp = await post('/v1/kyc/aadhaar/otp', { aadhaar: '234567890123' })
    expect(otp.statusCode).toBe(200)
    const wrong = await post('/v1/kyc/aadhaar/verify', { ref_id: otp.json().ref_id, otp: '000000' })
    expect(wrong.statusCode).toBe(422)
    const right = await post('/v1/kyc/aadhaar/verify', { ref_id: otp.json().ref_id, otp: MOCK_AADHAAR_OTP })
    expect(right.statusCode).toBe(200)
    expect(right.json().aadhaar.status).toBe('VERIFIED')
  })

  it("will not verify against another user's OTP session", async () => {
    const otp = await post('/v1/kyc/aadhaar/otp', { aadhaar: '234567890123' })
    const other = await loginAs(app, '+919833333333', 'CUSTOMER')
    const res = await post(
      '/v1/kyc/aadhaar/verify',
      { ref_id: otp.json().ref_id, otp: MOCK_AADHAAR_OTP },
      other.accessToken,
    )
    expect(res.statusCode).toBe(404)
  })

  it('refuses approval until PAN, Aadhaar and the licence are all verified', async () => {
    let res = await approve()
    expect(res.statusCode).toBe(409)
    expect(res.json().error.details.blockers).toEqual(['PAN_NOT_VERIFIED', 'AADHAAR_NOT_VERIFIED', 'LICENCE_MISSING'])

    await verifyPan()
    await verifyAadhaar()
    const doc = await uploadLicence()
    expect(doc.statusCode).toBe(201)

    // The driver's side is done, so they move into the review queue on their own.
    const onboarding = await app.inject({ method: 'GET', url: '/v1/driver/onboarding', headers: bearer(driver.accessToken) })
    expect(onboarding.json()).toMatchObject({ onboarding_status: 'UNDER_REVIEW', blockers: ['LICENCE_NOT_VERIFIED'] })

    await post(`/v1/admin/documents/${doc.json().id}/review`, { status: 'VERIFIED' }, ops.accessToken)
    res = await approve()
    expect(res.statusCode).toBe(200)
    expect(res.json().onboarding_status).toBe('APPROVED')
  })

  it('lets a customer verify for the optional badge', async () => {
    const customer = await loginAs(app, '+919844444444', 'CUSTOMER')
    const res = await post('/v1/kyc/pan', { pan: 'ABCPE1234F', name: 'Asha Rao' }, customer.accessToken)
    expect(res.statusCode).toBe(200)
  })

  it('rate limits verification attempts', async () => {
    let last = 0
    for (let i = 0; i < 11; i++) last = (await post('/v1/kyc/pan', { pan: 'ABCCE1234F', name: 'X Y' })).statusCode
    expect(last).toBe(429)
  })
})
