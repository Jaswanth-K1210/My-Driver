import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/client.js'
import { seed } from '../../src/db/seed.js'
import { findNearbyDrivers } from '../../src/modules/trips/geo-index.js'
import { bearer, loginAs } from '../helpers/auth.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'

const HITEC = { lat: 17.4399, lng: 78.3813 }

describe('driver availability and dispatchability', () => {
  let app: FastifyInstance
  let driverId: string
  let token: string

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })
  beforeEach(async () => {
    await resetDb()
    await resetRedis()
    await seed()
    const login = await loginAs(app, '+919848012345', 'DRIVER')
    driverId = login.userId
    token = login.accessToken
  })
  afterAll(async () => { await app.close() })

  const setAvailability = (payload: unknown) =>
    app.inject({
      method: 'POST', url: '/v1/driver/availability', headers: bearer(token), payload,
    })

  it('going ONLINE without a location leaves the driver undispatchable', async () => {
    const res = await setAvailability({ availability: 'ONLINE' })

    expect(res.statusCode).toBe(200)
    expect(res.json().dispatchable).toBe(false)

    // Online in the database, but dispatch searches the geo index — and the
    // driver has no known position, so nothing can be offered to them.
    const { rows } = await pool.query(
      'SELECT availability FROM driver_profiles WHERE user_id = $1', [driverId],
    )
    expect(rows[0].availability).toBe('ONLINE')
    expect(await findNearbyDrivers(HITEC, 5, 'MD-Standard', 10)).not.toContain(driverId)
  })

  it('going ONLINE with a location makes the driver immediately dispatchable', async () => {
    const res = await setAvailability({ availability: 'ONLINE', location: HITEC })

    expect(res.statusCode).toBe(200)
    expect(res.json().dispatchable).toBe(true)
    expect(await findNearbyDrivers(HITEC, 5, 'MD-Standard', 10)).toContain(driverId)
  })

  it('going OFFLINE removes the driver from the index', async () => {
    await setAvailability({ availability: 'ONLINE', location: HITEC })
    await setAvailability({ availability: 'OFFLINE' })

    expect(await findNearbyDrivers(HITEC, 5, 'MD-Standard', 10)).not.toContain(driverId)
  })

  it('rejects an unknown availability value', async () => {
    expect((await setAvailability({ availability: 'NAPPING' })).statusCode).toBe(400)
  })

  it('refuses a CUSTOMER token', async () => {
    const customer = (await loginAs(app, '+919876543210', 'CUSTOMER')).accessToken
    const res = await app.inject({
      method: 'POST', url: '/v1/driver/availability',
      headers: bearer(customer), payload: { availability: 'ONLINE' },
    })
    expect(res.statusCode).toBe(403)
  })
})
