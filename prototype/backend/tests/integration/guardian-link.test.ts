import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/client.js'
import { seed } from '../../src/db/seed.js'
import { awaitDispatchIdle } from '../../src/modules/trips/dispatch-tracker.js'
import { ConsoleSmsProvider, setSmsProvider } from '../../src/providers/sms/index.js'
import { bearer } from '../helpers/auth.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'
import { setLastFix } from '../helpers/safety.js'
import {
  BOOK_BODY, HITEC_CITY, makeCustomer, makeOnlineDriver, SELFIE, type Actor,
} from '../helpers/trips.js'

describe('guardian tracking links', () => {
  let app: FastifyInstance
  let customer: Actor
  let driver: Actor
  let tripId: string
  let sms: ConsoleSmsProvider

  beforeAll(async () => { app = await buildApp(); await app.ready() })
  afterAll(async () => { setSmsProvider(undefined); await app.close() })

  beforeEach(async () => {
    await resetDb(); await resetRedis(); await seed()
    customer = await makeCustomer(app, '+919876543210')
    driver = await makeOnlineDriver(app, '+919848012345')

    await pool.query(`UPDATE users SET full_name = 'Ramesh Kumar' WHERE id = $1`, [driver.userId])
    await pool.query(
      `UPDATE driver_profiles SET vehicle_model = 'Toyota Innova' WHERE user_id = $1`,
      [driver.userId],
    )

    const booked = await app.inject({
      method: 'POST', url: '/v1/trips/book',
      headers: bearer(customer.accessToken), payload: BOOK_BODY,
    })
    tripId = booked.json().id as string
    await awaitDispatchIdle()
    await app.inject({
      method: 'POST', url: `/v1/trips/${tripId}/offer/respond`,
      headers: bearer(driver.accessToken), payload: { accept: true },
    })
    const otp = (
      await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/handshake-otp`,
        headers: bearer(customer.accessToken),
      })
    ).json().otp as string
    await app.inject({
      method: 'POST', url: `/v1/trips/${tripId}/handshake`,
      headers: bearer(driver.accessToken),
      payload: { driver_selfie_base64: SELFIE, otp },
    })

    sms = new ConsoleSmsProvider(); setSmsProvider(sms)
  })

  const create = (share = false) =>
    app.inject({
      method: 'POST', url: `/v1/trips/${tripId}/guardian-link`,
      headers: bearer(customer.accessToken), payload: { share_by_sms: share },
    })

  const tokenFrom = (res: { json: () => { url: string } }) => res.json().url.split('/track/')[1]!

  it('issues an expiring link', async () => {
    const res = await create()
    expect(res.statusCode).toBe(200)
    expect(res.json().url).toMatch(/\/track\/[A-Za-z0-9_-]{20,}/)
    expect(new Date(res.json().expires_at).getTime()).toBeGreaterThan(Date.now())
  })

  it('stores the token hashed, never in plaintext', async () => {
    const token = tokenFrom(await create())
    const { rows } = await pool.query('SELECT token_hash FROM guardian_links')
    expect(rows[0].token_hash).not.toContain(token)
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('resolves with no authentication at all', async () => {
    const token = tokenFrom(await create())
    await setLastFix(tripId, 'driver', HITEC_CITY, 48)

    const res = await app.inject({ method: 'GET', url: `/v1/track/${token}` })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      trip_id: tripId,
      status: 'IN_TRIP',
      speed_kmh: 48,
      speed_ceiling_kmh: 60,
      over_ceiling: false,
      driver_first_name: 'Ramesh',
      vehicle: 'Toyota Innova',
    })
  })

  it('exposes only the driver first name and no contact details', async () => {
    const token = tokenFrom(await create())
    await setLastFix(tripId, 'driver', HITEC_CITY, 48)

    const body = (await app.inject({ method: 'GET', url: `/v1/track/${token}` })).payload

    // Someone holding a shared link is not a party to the trip.
    expect(body).not.toContain('Kumar')
    expect(body).not.toContain('+9198')
    expect(body).not.toContain('+9198765')
    expect(body).not.toContain('fare')
  })

  it('flags driving over the ceiling', async () => {
    const token = tokenFrom(await create())
    await setLastFix(tripId, 'driver', HITEC_CITY, 88)

    const res = await app.inject({ method: 'GET', url: `/v1/track/${token}` })
    expect(res.json()).toMatchObject({ speed_kmh: 88, over_ceiling: true })
  })

  it('texts the link to every guardian on request', async () => {
    await app.inject({
      method: 'POST', url: '/v1/me/guardians', headers: bearer(customer.accessToken),
      payload: { name: 'Rajesh', phone: '+919848012391' },
    })
    await app.inject({
      method: 'POST', url: '/v1/me/guardians', headers: bearer(customer.accessToken),
      payload: { name: 'Meera', phone: '+919848012392' },
    })
    sms.clear()

    const res = await create(true)
    expect(res.json().sent_to_guardians).toBe(2)
    expect(sms.sent).toHaveLength(2)
    expect(sms.sent[0]!.body).toContain('/track/')
  })

  it('can be revoked by the customer', async () => {
    const token = tokenFrom(await create())

    const revoked = await app.inject({
      method: 'DELETE', url: `/v1/trips/${tripId}/guardian-link`,
      headers: bearer(customer.accessToken),
    })
    expect(revoked.json().revoked).toBe(1)

    const res = await app.inject({ method: 'GET', url: `/v1/track/${token}` })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('LINK_REVOKED')
  })

  it('dies when the trip ends', async () => {
    const token = tokenFrom(await create())
    await app.inject({
      method: 'POST', url: `/v1/trips/${tripId}/complete`, headers: bearer(driver.accessToken),
    })

    const res = await app.inject({ method: 'GET', url: `/v1/track/${token}` })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('LINK_REVOKED')
  })

  it('rejects an expired link', async () => {
    const token = tokenFrom(await create())
    await pool.query(`UPDATE guardian_links SET expires_at = now() - interval '1 minute'`)

    const res = await app.inject({ method: 'GET', url: `/v1/track/${token}` })
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('LINK_EXPIRED')
  })

  it('rejects an unknown token', async () => {
    const res = await app.inject({
      method: 'GET', url: '/v1/track/aaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })
    expect(res.statusCode).toBe(404)
  })

  it('cannot be created for someone else trip', async () => {
    const stranger = await makeCustomer(app, '+919876543299')
    const res = await app.inject({
      method: 'POST', url: `/v1/trips/${tripId}/guardian-link`,
      headers: bearer(stranger.accessToken), payload: { share_by_sms: false },
    })
    expect(res.statusCode).toBe(404)
  })

  it('counts views, so who watched a trip is auditable', async () => {
    const token = tokenFrom(await create())
    await app.inject({ method: 'GET', url: `/v1/track/${token}` })
    await app.inject({ method: 'GET', url: `/v1/track/${token}` })

    const { rows } = await pool.query('SELECT views FROM guardian_links')
    expect(rows[0].views).toBe(2)
  })

  it('registers a push device token', async () => {
    const res = await app.inject({
      method: 'POST', url: '/v1/me/devices', headers: bearer(customer.accessToken),
      payload: { platform: 'ios', token: 'fcm-device-token-abc123' },
    })
    expect(res.statusCode).toBe(201)

    // Re-registering the same device must not duplicate it.
    await app.inject({
      method: 'POST', url: '/v1/me/devices', headers: bearer(customer.accessToken),
      payload: { platform: 'ios', token: 'fcm-device-token-abc123' },
    })
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM device_tokens')
    expect(rows[0].n).toBe(1)
  })
})
