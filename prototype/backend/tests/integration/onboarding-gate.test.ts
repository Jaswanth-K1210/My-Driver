import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/client.js'
import { seed } from '../../src/db/seed.js'
import { findNearbyDrivers } from '../../src/modules/trips/geo-index.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'
import { HITEC_CITY, makeOnlineDriver } from '../helpers/trips.js'

/**
 * The onboarding gate and Night Shield are only controls if dispatch reads
 * them. These tests are what makes that true: without them, an admin could
 * suspend a driver and that driver would keep receiving trips.
 *
 * Everything routes through findNearbyDrivers, so it is asserted directly
 * rather than through a booking — the gate is the query, not the caller.
 */
describe('dispatch eligibility gates', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })
  beforeEach(async () => {
    await resetDb()
    await resetRedis()
    await seed()
  })
  afterAll(async () => {
    await app.close()
  })

  const setStatus = (userId: string, status: string) =>
    pool.query(`UPDATE driver_profiles SET onboarding_status = $2 WHERE user_id = $1`, [
      userId,
      status,
    ])

  const nearby = (night = false) =>
    findNearbyDrivers(HITEC_CITY, 5, 'MD-Standard', 10, night)

  it('offers trips to an approved driver', async () => {
    const driver = await makeOnlineDriver(app, '+919700000001')
    expect(await nearby()).toContain(driver.userId)
  })

  for (const status of ['PENDING', 'TESTING', 'UNDER_REVIEW', 'REJECTED', 'SUSPENDED']) {
    it(`never offers a trip to a ${status} driver, even when online and certified`, async () => {
      const driver = await makeOnlineDriver(app, '+919700000002')
      // Online, positioned, correctly certified — the ONLY thing wrong is the
      // onboarding state. If this driver is dispatchable, the gate does nothing.
      await setStatus(driver.userId, status)

      expect(await nearby()).not.toContain(driver.userId)
    })
  }

  it('excludes a driver without Night Shield from a night trip', async () => {
    const driver = await makeOnlineDriver(app, '+919700000003')
    await pool.query(
      `UPDATE driver_profiles SET night_shield_certified = false WHERE user_id = $1`,
      [driver.userId],
    )

    // Same driver, same position, same certification: only the window differs.
    expect(await nearby(false)).toContain(driver.userId)
    expect(await nearby(true)).not.toContain(driver.userId)
  })

  it('includes a Night Shield certified driver in a night trip', async () => {
    const driver = await makeOnlineDriver(app, '+919700000004')
    expect(await nearby(true)).toContain(driver.userId)
  })

  it('stops offering the moment a driver is suspended mid-shift', async () => {
    const driver = await makeOnlineDriver(app, '+919700000005')
    expect(await nearby()).toContain(driver.userId)

    // No re-index, no logout — an admin suspension alone must take effect.
    await setStatus(driver.userId, 'SUSPENDED')

    expect(await nearby()).not.toContain(driver.userId)
  })
})
