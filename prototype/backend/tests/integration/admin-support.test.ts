import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/client.js'
import { seed } from '../../src/db/seed.js'
import { setDemoVisibility } from '../../src/lib/demo.js'
import { bearer } from '../helpers/auth.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'
import { loginAsRole } from '../helpers/safety.js'

async function makeTrip(customerPhone: string, opts: { demo?: boolean; status?: string; pickup?: string } = {}) {
  const { rows: u } = await pool.query<{ id: string }>(
    `INSERT INTO users (phone_number, full_name, is_demo) VALUES ($1, $2, $3) RETURNING id`,
    [customerPhone, opts.demo ? 'Demo Diya' : 'Real Ravi', opts.demo ?? false],
  )
  await pool.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'CUSTOMER')`, [u[0]!.id])
  const { rows: t } = await pool.query<{ id: string }>(
    `INSERT INTO trips (customer_id, status, booking_type, pickup_lat, pickup_lng, pickup_address, drop_lat, drop_lng, drop_address,
                        required_certification, speed_ceiling_kmh, pickup_handshake_otp_hash, estimated_fare, fare_amount)
     VALUES ($1, $2, 'POINT_TO_POINT', 17.44, 78.38, $3, 17.45, 78.39, 'Gachibowli', 'MD-Standard', 60, 'x', 150, 150)
     RETURNING id`,
    [u[0]!.id, opts.status ?? 'COMPLETED', opts.pickup ?? 'Cyber Towers'],
  )
  await pool.query(`INSERT INTO trip_events (trip_id, type) VALUES ($1, 'TRIP_REQUESTED')`, [t[0]!.id])
  return { customerId: u[0]!.id, tripId: t[0]!.id }
}

describe('console support tools', () => {
  let app: FastifyInstance
  let desk: { accessToken: string }
  let finance: { accessToken: string }
  let ops: { accessToken: string }

  beforeAll(async () => { app = await buildApp(); await app.ready() })
  beforeEach(async () => {
    await resetDb(); await resetRedis(); await seed()
    desk = await loginAsRole(app, '+919812300001', 'SAFETY_DESK_AGENT')
    finance = await loginAsRole(app, '+919812300002', 'FINANCE')
    ops = await loginAsRole(app, '+919812300003', 'OPS_MANAGER')
  })
  afterEach(() => setDemoVisibility(undefined))
  afterAll(async () => { await app.close() })

  const get = (url: string, token = desk.accessToken) => app.inject({ method: 'GET', url, headers: bearer(token) })

  it('driver detail carries earnings, trip counts, escalations, SOS and warnings', async () => {
    const { rows: d } = await pool.query<{ id: string }>(`INSERT INTO users (phone_number, full_name) VALUES ('+919812300090', 'Dev Driver') RETURNING id`)
    const driverId = d[0]!.id
    await pool.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'DRIVER')`, [driverId])
    await pool.query(`INSERT INTO driver_profiles (user_id) VALUES ($1)`, [driverId])
    const done = await makeTrip('+919812300091')
    const old = await makeTrip('+919812300092')
    const live = await makeTrip('+919812300093', { status: 'IN_TRIP' })
    await pool.query(`UPDATE trips SET driver_id = $1, driver_earnings = 131, completed_at = now() WHERE id = $2`, [driverId, done.tripId])
    await pool.query(`UPDATE trips SET driver_id = $1, driver_earnings = 100, completed_at = now() - interval '20 days' WHERE id = $2`, [driverId, old.tripId])
    await pool.query(`UPDATE trips SET driver_id = $1 WHERE id = $2`, [driverId, live.tripId])
    await pool.query(`INSERT INTO escalations (trip_id, level, status, reason) VALUES ($1, 'L4', 'OPEN', 'SILENT_SOS'), ($2, 'L2', 'RESOLVED', 'SPEED_CEILING_BREACH')`, [live.tripId, done.tripId])
    await pool.query(`INSERT INTO anomalies (trip_id, reason, level, window_start) VALUES ($1, 'SPEED_CEILING_BREACH', 'L1', now())`, [done.tripId])

    const res = await get(`/v1/admin/drivers/${driverId}`)
    expect(res.statusCode).toBe(200)
    expect(res.json().activity).toMatchObject({
      completed: 2, earned_total: 231, earned_week: 131, unpaid: 231,
      escalations: 2, open_escalations: 1, sos: 1, warnings: 1, current_trip_id: live.tripId,
    })
    expect(res.json().activity.recent_escalations).toHaveLength(2)
  })

  it('finds a trip by its customer-facing reference, name, phone and address', async () => {
    const { tripId } = await makeTrip('+919812300010', { pickup: 'Charminar' })
    const ref = `TRP-${tripId.replace(/-/g, '').slice(0, 6).toUpperCase()}`
    for (const q of [ref, 'real ravi', '9812300010', 'charminar']) {
      const res = await get(`/v1/admin/trips?q=${encodeURIComponent(q)}`)
      expect(res.statusCode, q).toBe(200)
      expect(res.json().items.map((t: { id: string }) => t.id), q).toContain(tripId)
    }
    expect((await get('/v1/admin/trips?q=nobody-like-this')).json().items).toHaveLength(0)
  })

  it('filters by status and pages with a cursor', async () => {
    for (let i = 0; i < 3; i++) await makeTrip(`+91981230002${i}`)
    await makeTrip('+919812300029', { status: 'CANCELLED' })
    expect((await get('/v1/admin/trips?status=CANCELLED')).json().items).toHaveLength(1)
    const p1 = (await get('/v1/admin/trips?limit=2')).json()
    expect(p1.items).toHaveLength(2)
    const p2 = (await get(`/v1/admin/trips?limit=2&cursor=${p1.next_cursor}`)).json()
    expect(p2.items).toHaveLength(2)
    expect(p2.items[0].id).not.toBe(p1.items[0].id)
  })

  it('shows a trip in full without leaking the handshake secret, and audits the view', async () => {
    const { tripId } = await makeTrip('+919812300030')
    const res = await get(`/v1/admin/trips/${tripId}`)
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.trip.id).toBe(tripId)
    expect(body.events[0].type).toBe('TRIP_REQUESTED')
    expect(body.trip).not.toHaveProperty('pickup_handshake_otp_hash')
    const { rows } = await pool.query(`SELECT 1 FROM audit_log WHERE action = 'VIEW_TRIP' AND subject = $1`, [tripId])
    expect(rows).toHaveLength(1)
  })

  it('looks up customers and their history', async () => {
    const { customerId } = await makeTrip('+919812300040')
    expect((await get('/v1/admin/customers?q=00040')).json().items[0].id).toBe(customerId)
    const detail = (await get(`/v1/admin/customers/${customerId}`)).json()
    expect(detail.stats.trips).toBe(1)
    expect(detail.recent_trips).toHaveLength(1)
  })

  it('hides demo accounts everywhere when the demo toggle is off', async () => {
    await makeTrip('+919812300050')
    await makeTrip('+919812300051', { demo: true })
    setDemoVisibility(true)
    expect((await get('/v1/admin/trips')).json().items).toHaveLength(2)
    expect((await get('/v1/admin/settings')).json().demo_data_visible).toBe(true)
    setDemoVisibility(false)
    expect((await get('/v1/admin/trips')).json().items).toHaveLength(1)
    expect((await get('/v1/admin/customers')).json().items.every((c: { is_demo: boolean }) => !c.is_demo)).toBe(true)
    expect((await get('/v1/admin/overview?days=7', ops.accessToken)).json().totals.requested).toBe(1)
    expect((await get('/v1/admin/settings')).json().demo_data_visible).toBe(false)
  })

  it('gives managers the overview, not the desk', async () => {
    expect((await get('/v1/admin/overview?days=30', ops.accessToken)).statusCode).toBe(200)
    expect((await get('/v1/admin/overview?days=30')).statusCode).toBe(403)
    expect((await get('/v1/admin/overview?days=12', ops.accessToken)).statusCode).toBe(400)
  })

  it('lets Finance change prices (audited, effective at once) but not Ops', async () => {
    const patch = (token: string, body: object) =>
      app.inject({ method: 'PATCH', url: '/v1/admin/rate-cards/MD-Standard', headers: bearer(token), payload: body })
    expect((await patch(ops.accessToken, { per_km_rate: 17 })).statusCode).toBe(403)
    expect((await patch(finance.accessToken, { per_km_rate: 5000 })).statusCode).toBe(400)
    const ok = await patch(finance.accessToken, { per_km_rate: 17, reason: 'Fuel prices' })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().per_km_rate).toBe(17)
    // The public rate cards reflect it immediately (cache dropped).
    const cards = (await app.inject({ method: 'GET', url: '/v1/rate-cards' })).json()
    expect(cards.find((c: { skill_id: string }) => c.skill_id === 'MD-Standard').per_km_rate).toBe(17)
    const { rows } = await pool.query(`SELECT payload FROM audit_log WHERE action = 'RATE_CARD_UPDATED'`)
    expect(rows[0].payload).toMatchObject({ before: { per_km_rate: 16 }, after: { per_km_rate: 17 }, reason: 'Fuel prices' })
  })

  it('searches drivers by name and filters every onboarding state', async () => {
    const { rows } = await pool.query<{ id: string }>(`INSERT INTO users (phone_number, full_name) VALUES ('+919812300060', 'Suspended Suresh') RETURNING id`)
    await pool.query(`INSERT INTO driver_profiles (user_id, onboarding_status, vehicle_plate) VALUES ($1, 'SUSPENDED', 'TS09AB1234')`, [rows[0]!.id])
    const byState = (await get('/v1/admin/drivers?status=SUSPENDED', ops.accessToken)).json().items
    expect(byState.map((d: { user_id: string }) => d.user_id)).toContain(rows[0]!.id)
    expect((await get('/v1/admin/drivers?q=suresh', ops.accessToken)).json().items).toHaveLength(1)
    expect((await get('/v1/admin/drivers?q=ab1234', ops.accessToken)).json().items).toHaveLength(1)
  })
})
