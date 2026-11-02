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
import { loginAsRole } from '../helpers/safety.js'
import { BOOK_BODY, GACHIBOWLI, HITEC_CITY, makeCustomer, makeOnlineDriver, SELFIE, type Actor } from '../helpers/trips.js'

// Quotes take no speed limit; that is a booking-only field.
const { speed_ceiling_kmh: _ceiling, ...QUOTE_BODY } = BOOK_BODY
const { required_certification: _tier, ...NO_TIER } = QUOTE_BODY

describe('booking: automatic tier, admin fees, safety defaults', () => {
  let app: FastifyInstance
  let customer: Actor

  beforeAll(async () => { app = await buildApp(); await app.ready() })
  beforeEach(async () => {
    await resetDb(); await resetRedis(); await seed()
    customer = await makeCustomer(app, '+919876543210')
  })
  afterAll(async () => { await app.close() })

  const quote = (body: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/v1/trips/quote', headers: bearer(customer.accessToken), payload: body })

  it('picks the tier from the car when the client sends none', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ company: 'Maruti Suzuki', model: 'Swift', transmission: 'Manual' }, 'MD-Standard'],
      [{ company: 'Hyundai', model: 'Creta', transmission: 'Automatic' }, 'MD-Auto'],
      [{ company: 'Toyota', model: 'Fortuner', transmission: 'Automatic' }, 'MD-SUV'],
      [{ company: 'BMW', model: '3 Series', transmission: 'Automatic' }, 'MD-Lux'],
    ]
    for (const [car, tier] of cases) {
      const res = await quote({ ...NO_TIER, car_details: car })
      expect(res.statusCode).toBe(200)
      expect(res.json().required_certification).toBe(tier)
      expect(res.json().tier_label).toBeTruthy()
    }
  })

  it('falls back to Standard when ops have hidden the car\'s tier', async () => {
    await pool.query(`UPDATE rate_cards SET active = false WHERE skill_id = 'MD-Lux'`)
    const res = await quote({ ...NO_TIER, car_details: { company: 'BMW', model: 'X1' } })
    expect(res.json().required_certification).toBe('MD-Standard')
  })

  it('sells hourly hire from 2 hours', async () => {
    const one = await quote({ booking_type: 'HOURLY', hours: 1, pickup: HITEC_CITY, required_certification: 'MD-Standard' })
    expect(one.statusCode).toBe(400)
    const two = await quote({ booking_type: 'HOURLY', hours: 2, pickup: HITEC_CITY, required_certification: 'MD-Standard' })
    expect(two.statusCode).toBe(200)
  })

  it('prices the next quote with fees changed in the console, and audits the change', async () => {
    const finance = await loginAsRole(app, '+919000000001', 'FINANCE')
    const before = (await quote(QUOTE_BODY)).json().fare

    const res = await app.inject({
      method: 'PATCH', url: '/v1/admin/pricing/fees', headers: bearer(finance.accessToken),
      payload: { platform_fee: 25, city_stop_fee: 75, reason: 'test' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ platform_fee: 25, city_stop_fee: 75, night_fee: 30 })

    const after = (await quote(QUOTE_BODY)).json().fare
    expect(after.platform_fee).toBe(25)
    expect(after.total).toBeCloseTo(before.total + 6, 2)

    const config = (await app.inject({ method: 'GET', url: '/v1/catalogue/trip-config' })).json()
    expect(config.fees).toMatchObject({ platform_fee: 25, city_stop_fee: 75 })

    const { rows } = await pool.query(`SELECT action FROM audit_log WHERE action = 'PRICING_FEES_UPDATED'`)
    expect(rows).toHaveLength(1)
  })

  it('only pricing staff can change fees', async () => {
    const agent = await loginAsRole(app, '+919000000002', 'SAFETY_DESK_AGENT')
    const res = await app.inject({
      method: 'PATCH', url: '/v1/admin/pricing/fees', headers: bearer(agent.accessToken), payload: { platform_fee: 0 },
    })
    expect(res.statusCode).toBe(403)
  })

  it('stores safety defaults once chosen', async () => {
    const me = () => app.inject({ method: 'GET', url: '/v1/me', headers: bearer(customer.accessToken) })
    expect((await me()).json().safety).toMatchObject({ set: false, speed_limit_kmh: 60 })

    const patch = await app.inject({
      method: 'PATCH', url: '/v1/me', headers: bearer(customer.accessToken),
      payload: { safety: { speed_limit_kmh: 80, share_with_guardians: true, prefer_female_driver: true } },
    })
    expect(patch.statusCode).toBe(200)
    expect((await me()).json().safety).toEqual({
      set: true, speed_limit_kmh: 80, share_with_guardians: true, prefer_female_driver: true,
    })
  })

  describe('dispatch and trip start', () => {
    const book = (extra: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: '/v1/trips/book', headers: bearer(customer.accessToken), payload: { ...BOOK_BODY, ...extra } })

    it('offers a female driver first when the customer prefers one, even if farther', async () => {
      const near = await makeOnlineDriver(app, '+919848012345', HITEC_CITY)
      const far = await makeOnlineDriver(app, '+919848012346', GACHIBOWLI)
      await pool.query(`UPDATE driver_profiles SET gender = 'MALE' WHERE user_id = $1`, [near.userId])
      await pool.query(`UPDATE driver_profiles SET gender = 'FEMALE' WHERE user_id = $1`, [far.userId])

      const tripId = (await book({ prefer_female_driver: true })).json().id as string
      await awaitDispatchIdle()
      const { rows } = await pool.query(`SELECT driver_id FROM trip_offers WHERE trip_id = $1`, [tripId])
      expect(rows[0].driver_id).toBe(far.userId)
    })

    it('still offers the nearest driver without the preference', async () => {
      const near = await makeOnlineDriver(app, '+919848012345', HITEC_CITY)
      const far = await makeOnlineDriver(app, '+919848012346', GACHIBOWLI)
      await pool.query(`UPDATE driver_profiles SET gender = 'FEMALE' WHERE user_id = $1`, [far.userId])

      const tripId = (await book({})).json().id as string
      await awaitDispatchIdle()
      const { rows } = await pool.query(`SELECT driver_id FROM trip_offers WHERE trip_id = $1`, [tripId])
      expect(rows[0].driver_id).toBe(near.userId)
    })

    it('texts the guardians when the trip starts, if the booking asked to', async () => {
      const sms = new ConsoleSmsProvider()
      try {
        const driver = await makeOnlineDriver(app, '+919848012345', HITEC_CITY)
        await app.inject({
          method: 'POST', url: '/v1/me/guardians', headers: bearer(customer.accessToken),
          payload: { name: 'Rajesh', relation: 'Father', phone: '+919848012399' },
        })
        const tripId = (await book({ share_with_guardians: true })).json().id as string
        await awaitDispatchIdle()
        await app.inject({ method: 'POST', url: `/v1/trips/${tripId}/offer/respond`, headers: bearer(driver.accessToken), payload: { accept: true } })
        const otp = (await app.inject({ method: 'POST', url: `/v1/trips/${tripId}/handshake-otp`, headers: bearer(customer.accessToken) })).json().otp
        // Installed only now: signing in (loginAs) swaps in its own provider.
        setSmsProvider(sms)
        const start = await app.inject({
          method: 'POST', url: `/v1/trips/${tripId}/handshake`, headers: bearer(driver.accessToken),
          payload: { driver_selfie_base64: SELFIE, otp },
        })
        expect(start.statusCode).toBe(200)
        expect(sms.sent.map((m) => m.to)).toEqual(['+919848012399'])
        expect(sms.sent[0]!.body).toMatch(/follow my mydriver trip/i)
      } finally {
        setSmsProvider(undefined)
      }
    })
  })

  it('names a pin dropped on the map', async () => {
    const at = (lat: number, lng: number) =>
      app.inject({ method: 'GET', url: `/v1/locations/reverse?lat=${lat}&lng=${lng}`, headers: bearer(customer.accessToken) })
    const near = (await at(17.4505, 78.3809)).json()
    expect(near).toMatchObject({ name: 'Near Cyber Towers', lat: 17.4505, lng: 78.3809 })
    const nowhere = (await at(17.1, 78.1)).json()
    expect(nowhere).toMatchObject({ name: 'Pinned location', lat: 17.1, lng: 78.1 })
  })
})
