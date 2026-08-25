import type { FastifyInstance } from 'fastify'
import { pool } from '../../src/db/client.js'
import { upsertDriverLocation } from '../../src/modules/trips/geo-index.js'
import { bearer, loginAs } from './auth.js'

export const HITEC_CITY = { lat: 17.4399, lng: 78.3813 }
export const GACHIBOWLI = { lat: 17.4483, lng: 78.3915 }

export const BOOK_BODY = {
  booking_type: 'POINT_TO_POINT' as const,
  pickup: HITEC_CITY,
  drop: GACHIBOWLI,
  required_certification: 'MD-Standard',
  speed_ceiling_kmh: 60,
}

/** A 1x1 JPEG-ish payload — enough bytes for the mock liveness provider. */
export const SELFIE = Buffer.from('fake-selfie-bytes-for-testing').toString('base64')

export type Actor = { userId: string; accessToken: string }

export async function makeCustomer(app: FastifyInstance, phone: string): Promise<Actor> {
  const { userId, accessToken } = await loginAs(app, phone, 'CUSTOMER')
  return { userId, accessToken }
}

/** Log a driver in, put them ONLINE, place them on the geo index, certify them. */
export async function makeOnlineDriver(
  app: FastifyInstance,
  phone: string,
  at = HITEC_CITY,
  certifications: string[] = ['MD-Standard'],
): Promise<Actor> {
  const { userId, accessToken } = await loginAs(app, phone, 'DRIVER')

  await app.inject({
    method: 'POST', url: '/v1/driver/availability',
    headers: bearer(accessToken), payload: { availability: 'ONLINE' },
  })
  await pool.query(`UPDATE driver_profiles SET certifications = $2 WHERE user_id = $1`, [
    userId, certifications,
  ])
  await upsertDriverLocation(userId, at, { force: true })

  return { userId, accessToken }
}

export const eventTypes = async (tripId: string): Promise<string[]> => {
  const { rows } = await pool.query<{ type: string }>(
    `SELECT type FROM trip_events WHERE trip_id = $1 ORDER BY created_at, type`,
    [tripId],
  )
  return rows.map((r) => r.type)
}

export const tripStatus = async (tripId: string): Promise<string> => {
  const { rows } = await pool.query<{ status: string }>(
    `SELECT status FROM trips WHERE id = $1`, [tripId],
  )
  return rows[0]!.status
}

/** Poll until the out-of-band dispatch has moved the trip off REQUESTED. */
export async function waitForStatus(
  tripId: string,
  expected: string,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if ((await tripStatus(tripId)) === expected) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`trip ${tripId} never reached ${expected} (is ${await tripStatus(tripId)})`)
}
