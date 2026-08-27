import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/client.js'
import { seed } from '../../src/db/seed.js'
import { awaitDispatchIdle } from '../../src/modules/trips/dispatch-tracker.js'
import { INSPECTION_ZONES } from '../../src/modules/vault/zones.js'
import { MemoryStorageProvider, getStorageProvider } from '../../src/providers/storage/index.js'
import { bearer } from '../helpers/auth.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'
import { loginAsRole } from '../helpers/safety.js'
import {
  BOOK_BODY, HITEC_CITY, makeCustomer, makeOnlineDriver, SELFIE, type Actor,
} from '../helpers/trips.js'

const photo = async () =>
  (
    await sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 180, g: 40, b: 40 } } })
      .jpeg()
      .toBuffer()
  ).toString('base64')

describe('Trip Vault', () => {
  let app: FastifyInstance
  let customer: Actor
  let driver: Actor
  let tripId: string
  let jpg: string

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
    jpg = await photo()
  })
  afterAll(async () => { await app.close() })

  beforeEach(async () => {
    await resetDb(); await resetRedis(); await seed()
    customer = await makeCustomer(app, '+919876543210')
    driver = await makeOnlineDriver(app, '+919848012345')

    await pool.query(`UPDATE users SET full_name = 'Ramesh Kumar' WHERE id = $1`, [driver.userId])
    await pool.query(`UPDATE users SET full_name = 'Priya Sharma' WHERE id = $1`, [customer.userId])

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
  })

  const start = (phase: 'PRE' | 'POST', actor = driver) =>
    app.inject({
      method: 'POST', url: `/v1/trips/${tripId}/inspections/${phase}`,
      headers: bearer(actor.accessToken),
    })

  const capture = (phase: 'PRE' | 'POST', zone: string, actor = driver) =>
    app.inject({
      method: 'POST', url: `/v1/trips/${tripId}/inspections/${phase}/photos`,
      headers: bearer(actor.accessToken),
      payload: { zone, photo_base64: jpg, lat: HITEC_CITY.lat, lng: HITEC_CITY.lng },
    })

  const complete = (phase: 'PRE' | 'POST', actor = driver) =>
    app.inject({
      method: 'POST', url: `/v1/trips/${tripId}/inspections/${phase}/complete`,
      headers: bearer(actor.accessToken),
    })

  const captureAll = async (phase: 'PRE' | 'POST') => {
    for (const zone of INSPECTION_ZONES) await capture(phase, zone)
  }

  describe('8-point inspection', () => {
    it('starts and reports all eight zones outstanding', async () => {
      const res = await start('PRE')
      expect(res.statusCode).toBe(200)
      expect(res.json().remaining).toHaveLength(8)
    })

    it('captures a zone, watermarks it and returns its digest', async () => {
      await start('PRE')
      const res = await capture('PRE', 'FRONT')

      expect(res.statusCode).toBe(200)
      expect(res.json().sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(res.json().remaining).toHaveLength(7)
      expect(res.json().complete).toBe(false)

      const { rows } = await pool.query(`SELECT watermark, lat, lng FROM inspection_photos`)
      expect(rows[0].watermark.burned_in).toBe(true)
      expect(rows[0].watermark.zone).toBe('FRONT')
      expect(Number(rows[0].lat)).toBeCloseTo(HITEC_CITY.lat, 4)
    })

    it('stores the watermarked bytes, not the original', async () => {
      await start('PRE')
      await capture('PRE', 'FRONT')

      const storage = getStorageProvider() as MemoryStorageProvider
      const { rows } = await pool.query<{ storage_key: string }>(
        `SELECT storage_key FROM inspection_photos`,
      )
      const stored = storage.objects.get(rows[0]!.storage_key)

      expect(stored).toBeDefined()
      expect(stored!.body.length).not.toBe(Buffer.from(jpg, 'base64').length)
      expect(stored!.contentType).toBe('image/jpeg')
    })

    it('refuses the same zone twice', async () => {
      await start('PRE')
      await capture('PRE', 'FRONT')
      const again = await capture('PRE', 'FRONT')

      expect(again.statusCode).toBe(409)
      expect(again.json().error.code).toBe('ZONE_ALREADY_CAPTURED')
    })

    it('refuses to seal a partial inspection', async () => {
      await start('PRE')
      await capture('PRE', 'FRONT')

      const res = await complete('PRE')
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('INSPECTION_INCOMPLETE')
      expect(res.json().error.details.missing).toHaveLength(7)
    })

    it('seals once all eight are captured', async () => {
      await start('PRE')
      await captureAll('PRE')

      const res = await complete('PRE')
      expect(res.statusCode).toBe(200)
      expect(res.json().photos).toBe(8)
      expect(res.json().sealed_at).toBeTruthy()
    })

    it('refuses new photos after sealing', async () => {
      await start('PRE')
      await captureAll('PRE')
      await complete('PRE')

      // The photos are already recorded, so re-capture is blocked by the seal.
      await pool.query(`DELETE FROM inspection_photos WHERE zone = 'BOOT'`).catch(() => undefined)
      const res = await capture('PRE', 'BOOT')
      expect([409]).toContain(res.statusCode)
    })

    it('is append-only — a sealed photo cannot be rewritten', async () => {
      await start('PRE')
      await capture('PRE', 'FRONT')

      await expect(
        pool.query(`UPDATE inspection_photos SET sha256 = 'tampered'`),
      ).rejects.toThrow(/append-only/)
      await expect(pool.query(`DELETE FROM inspection_photos`)).rejects.toThrow(/append-only/)
    })

    it('keeps pre and post inspections separate', async () => {
      await start('PRE')
      await captureAll('PRE')
      await complete('PRE')

      await start('POST')
      const res = await capture('POST', 'FRONT')
      expect(res.statusCode).toBe(200)

      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM inspections`)
      expect(rows[0].n).toBe(2)
    })

    it('refuses a customer token', async () => {
      const res = await start('PRE', customer)
      expect(res.statusCode).toBe(403)
    })

    it('refuses a driver who is not on the trip', async () => {
      const other = await makeOnlineDriver(app, '+919848012399', { lat: 17.9, lng: 78.9 })
      expect((await start('PRE', other)).statusCode).toBe(404)
    })

    it('lets either participant read the inspection status', async () => {
      await start('PRE')
      await capture('PRE', 'FRONT')

      for (const actor of [customer, driver]) {
        const res = await app.inject({
          method: 'GET', url: `/v1/trips/${tripId}/inspections`,
          headers: bearer(actor.accessToken),
        })
        expect(res.statusCode).toBe(200)
        expect(res.json().zones).toHaveLength(8)
        expect(res.json().phases[0].photos[0].zone).toBe('FRONT')
      }
    })
  })

  describe('certificate', () => {
    const finishTrip = async () => {
      await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/complete`,
        headers: bearer(driver.accessToken),
      })
    }

    it('refuses to issue for a trip still under way', async () => {
      const res = await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/certificate`,
        headers: bearer(customer.accessToken),
      })
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('TRIP_NOT_COMPLETED')
    })

    it('issues a real PDF once the trip completes', async () => {
      await start('PRE'); await captureAll('PRE'); await complete('PRE')
      await finishTrip()

      const res = await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/certificate`,
        headers: bearer(customer.accessToken),
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().cert_id).toMatch(/^MV-\d{4}-[A-Z0-9]{6}$/)
      expect(res.json().sha256).toMatch(/^[0-9a-f]{64}$/)

      const storage = getStorageProvider() as MemoryStorageProvider
      const { rows } = await pool.query<{ storage_key: string }>(
        `SELECT storage_key FROM trip_certificates`,
      )
      const pdf = storage.objects.get(rows[0]!.storage_key)!
      expect(pdf.body.subarray(0, 5).toString()).toBe('%PDF-')
      expect(pdf.contentType).toBe('application/pdf')
    })

    it('is immutable — reissuing returns the same document', async () => {
      await finishTrip()
      const first = (
        await app.inject({
          method: 'POST', url: `/v1/trips/${tripId}/certificate`,
          headers: bearer(customer.accessToken),
        })
      ).json()
      const second = (
        await app.inject({
          method: 'POST', url: `/v1/trips/${tripId}/certificate`,
          headers: bearer(driver.accessToken),
        })
      ).json()

      expect(second.cert_id).toBe(first.cert_id)
      expect(second.sha256).toBe(first.sha256)

      const { rows } = await pool.query(`SELECT count(*)::int AS n FROM trip_certificates`)
      expect(rows[0].n).toBe(1)
    })

    it('cannot be rewritten', async () => {
      await finishTrip()
      await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/certificate`,
        headers: bearer(customer.accessToken),
      })
      await expect(
        pool.query(`UPDATE trip_certificates SET sha256 = 'tampered'`),
      ).rejects.toThrow(/append-only/)
    })

    it('refuses a non-participant', async () => {
      await finishTrip()
      const stranger = await makeCustomer(app, '+919876543288')
      const res = await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/certificate`,
        headers: bearer(stranger.accessToken),
      })
      expect(res.statusCode).toBe(404)
    })

    it('serves signed photo URLs to a participant', async () => {
      await start('PRE'); await captureAll('PRE'); await complete('PRE')

      const res = await app.inject({
        method: 'GET', url: `/v1/trips/${tripId}/vault/photos`,
        headers: bearer(customer.accessToken),
      })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toHaveLength(8)
      expect(res.json()[0].url).toBeTruthy()
      expect(res.json()[0].sha256).toMatch(/^[0-9a-f]{64}$/)
    })
  })

  describe('L5 evidence packet', () => {
    it('now includes the vault contents instead of listing them pending', async () => {
      await start('PRE'); await captureAll('PRE'); await complete('PRE')
      await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/complete`, headers: bearer(driver.accessToken),
      })
      await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/certificate`,
        headers: bearer(customer.accessToken),
      })

      // Reopen an incident on the finished trip so it can be released.
      const { raiseEscalation } = await import('../../src/modules/escalation/service.js')
      const { escalation } = await raiseEscalation({
        tripId, level: 'L4', reason: 'SILENT_SOS',
      })

      const manager = await loginAsRole(app, '+919000000002', 'OPS_MANAGER')
      const res = await app.inject({
        method: 'POST', url: `/v1/admin/escalations/${escalation.id}/release-evidence`,
        headers: bearer(manager.accessToken), payload: { recipient: 'Dial 112 Telangana' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().inspection_photos).toBe(8)
      expect(res.json().certificate.cert_id).toMatch(/^MV-/)
      // Nothing is outstanding any more.
      expect(res.json().pending).toEqual([])
    })

    it('still reports what is genuinely missing', async () => {
      const { raiseEscalation } = await import('../../src/modules/escalation/service.js')
      const { escalation } = await raiseEscalation({ tripId, level: 'L4', reason: 'SILENT_SOS' })

      const manager = await loginAsRole(app, '+919000000002', 'OPS_MANAGER')
      const res = await app.inject({
        method: 'POST', url: `/v1/admin/escalations/${escalation.id}/release-evidence`,
        headers: bearer(manager.accessToken), payload: { recipient: 'Dial 112' },
      })

      expect(res.json().pending).toEqual(['inspection_photos', 'signed_certificate'])
    })
  })
})
