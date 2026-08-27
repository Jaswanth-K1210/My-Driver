import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/client.js'
import { seed } from '../../src/db/seed.js'
import { AUTO_PROMOTE_AFTER_SECONDS } from '../../src/modules/escalation/levels.js'
import { raiseEscalation } from '../../src/modules/escalation/service.js'
import { promoteStaleEscalations } from '../../src/modules/escalation/sweeper.js'
import { awaitDispatchIdle } from '../../src/modules/trips/dispatch-tracker.js'
import { ConsoleSmsProvider, setSmsProvider } from '../../src/providers/sms/index.js'
import { ConsoleVoiceProvider, setVoiceProvider } from '../../src/providers/voice/index.js'
import { bearer } from '../helpers/auth.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'
import { auditActions, escalationEventTypes, liveEscalation, loginAsRole } from '../helpers/safety.js'
import {
  BOOK_BODY, makeCustomer, makeOnlineDriver, SELFIE, tripStatus, type Actor,
} from '../helpers/trips.js'

describe('L0–L5 escalation and the Safety Desk', () => {
  let app: FastifyInstance
  let customer: Actor
  let driver: Actor
  let agent: Actor
  let manager: Actor
  let tripId: string
  let sms: ConsoleSmsProvider
  let voice: ConsoleVoiceProvider

  beforeAll(async () => { app = await buildApp(); await app.ready() })
  afterAll(async () => {
    setSmsProvider(undefined)
    setVoiceProvider(undefined)
    await app.close()
  })

  beforeEach(async () => {
    await resetDb(); await resetRedis(); await seed()

    customer = await makeCustomer(app, '+919876543210')
    driver = await makeOnlineDriver(app, '+919848012345')
    agent = await loginAsRole(app, '+919000000001', 'SAFETY_DESK_AGENT')
    manager = await loginAsRole(app, '+919000000002', 'OPS_MANAGER')

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
    voice = new ConsoleVoiceProvider(); setVoiceProvider(voice)
  })

  describe('silent SOS', () => {
    it('goes straight to L4 and marks the trip escalated', async () => {
      const res = await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/sos`,
        headers: bearer(customer.accessToken), payload: { silent: true },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toMatchObject({ level: 'L4', reason: 'SILENT_SOS', status: 'OPEN' })
      expect(await tripStatus(tripId)).toBe('ESCALATED')
    })

    it('carries the sub-3-minute contact SLA', async () => {
      const res = await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/sos`,
        headers: bearer(customer.accessToken), payload: { silent: true },
      })

      const deadline = new Date(res.json().sla_deadline).getTime()
      const seconds = (deadline - Date.now()) / 1000
      expect(seconds).toBeGreaterThan(170)
      expect(seconds).toBeLessThanOrEqual(180)
    })

    it('can be raised by the driver too', async () => {
      const res = await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/sos`,
        headers: bearer(driver.accessToken), payload: { silent: true },
      })
      expect(res.json().level).toBe('L4')
      expect(res.json().details.raised_by_role).toBe('DRIVER')
    })

    it('refuses someone who is not on the trip', async () => {
      const stranger = await makeCustomer(app, '+919876543288')
      const res = await app.inject({
        method: 'POST', url: `/v1/trips/${tripId}/sos`,
        headers: bearer(stranger.accessToken), payload: { silent: true },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('one incident per trip', () => {
    it('promotes the live incident rather than opening a second', async () => {
      await raiseEscalation({ tripId, level: 'L1', reason: 'SPEED_CEILING_BREACH' })
      await raiseEscalation({ tripId, level: 'L4', reason: 'SILENT_SOS' })

      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM escalations WHERE trip_id = $1`, [tripId],
      )
      expect(rows[0].n).toBe(1)
      expect((await liveEscalation(tripId)).level).toBe('L4')
    })

    it('records corroborating evidence without lowering the level', async () => {
      const { escalation } = await raiseEscalation({ tripId, level: 'L4', reason: 'SILENT_SOS' })
      await raiseEscalation({
        tripId, level: 'L1', reason: 'SPEED_CEILING_BREACH', details: { speed_kmh: 91 },
      })

      const live = await liveEscalation(tripId)
      expect(live.level).toBe('L4')
      expect(await escalationEventTypes(escalation.id)).toContain('CORROBORATED')
    })
  })

  describe('auto-promotion', () => {
    it('promotes an unacknowledged L1 to L2 after the timeout', async () => {
      await raiseEscalation({ tripId, level: 'L1', reason: 'ROUTE_DEVIATION_EXCEEDED' })

      // Nothing to do yet — the incident is fresh.
      expect(await promoteStaleEscalations()).toBe(0)

      await pool.query(
        `UPDATE escalations SET opened_at = now() - ($1 || ' seconds')::interval
          WHERE trip_id = $2`,
        [String(AUTO_PROMOTE_AFTER_SECONDS + 5), tripId],
      )
      expect(await promoteStaleEscalations()).toBe(1)

      const live = await liveEscalation(tripId)
      expect(live.level).toBe('L2')
      expect(live.reason).toBe('UNACKNOWLEDGED_ANOMALY')
      // L2 is where the documented SLA clock starts.
      expect(live.sla_deadline).not.toBeNull()
    })

    it('leaves an acknowledged L1 alone', async () => {
      const { escalation } = await raiseEscalation({ tripId, level: 'L1', reason: 'SPEED_CEILING_BREACH' })
      await app.inject({
        method: 'POST', url: `/v1/admin/escalations/${escalation.id}/acknowledge`,
        headers: bearer(agent.accessToken),
      })
      await pool.query(
        `UPDATE escalations SET opened_at = now() - interval '600 seconds' WHERE trip_id = $1`,
        [tripId],
      )

      expect(await promoteStaleEscalations()).toBe(0)
      expect((await liveEscalation(tripId)).level).toBe('L1')
    })
  })

  describe('agent actions', () => {
    const openSos = async () =>
      (
        await app.inject({
          method: 'POST', url: `/v1/trips/${tripId}/sos`,
          headers: bearer(customer.accessToken), payload: { silent: true },
        })
      ).json()

    it('acknowledges an incident and assigns it to the agent', async () => {
      const incident = await openSos()
      const res = await app.inject({
        method: 'POST', url: `/v1/admin/escalations/${incident.id}/acknowledge`,
        headers: bearer(agent.accessToken),
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('ACKNOWLEDGED')
      expect(res.json().assigned_agent_id).toBe(agent.userId)
    })

    it('refuses a second acknowledgement', async () => {
      const incident = await openSos()
      await app.inject({
        method: 'POST', url: `/v1/admin/escalations/${incident.id}/acknowledge`,
        headers: bearer(agent.accessToken),
      })
      const again = await app.inject({
        method: 'POST', url: `/v1/admin/escalations/${incident.id}/acknowledge`,
        headers: bearer(agent.accessToken),
      })
      expect(again.statusCode).toBe(409)
    })

    it('places a one-click IVR call and never echoes the full number', async () => {
      const incident = await openSos()
      const res = await app.inject({
        method: 'POST', url: `/v1/admin/escalations/${incident.id}/call`,
        headers: bearer(agent.accessToken), payload: { party: 'DRIVER' },
      })

      expect(res.statusCode).toBe(200)
      expect(voice.calls).toHaveLength(1)
      expect(voice.calls[0]!.to).toBe('+919848012345')
      expect(res.json().to_masked).not.toContain('9848012345')
      expect(await escalationEventTypes(incident.id)).toContain('IVR_CALL_PLACED')
    })

    it('refuses to lower an incident', async () => {
      const incident = await openSos() // L4
      const res = await app.inject({
        method: 'POST', url: `/v1/admin/escalations/${incident.id}/promote`,
        headers: bearer(agent.accessToken), payload: { level: 'L2' },
      })
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('INVALID_ESCALATION_PROMOTION')
    })

    it('resolving releases the trip back to IN_TRIP', async () => {
      const incident = await openSos()
      expect(await tripStatus(tripId)).toBe('ESCALATED')

      const res = await app.inject({
        method: 'POST', url: `/v1/admin/escalations/${incident.id}/resolve`,
        headers: bearer(agent.accessToken), payload: { resolution: 'False alarm, customer confirmed safe' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().status).toBe('RESOLVED')
      expect(await tripStatus(tripId)).toBe('IN_TRIP')
    })

    it('keeps a complete, immutable incident history', async () => {
      const incident = await openSos()
      await app.inject({
        method: 'POST', url: `/v1/admin/escalations/${incident.id}/acknowledge`,
        headers: bearer(agent.accessToken),
      })
      await app.inject({
        method: 'POST', url: `/v1/admin/escalations/${incident.id}/resolve`,
        headers: bearer(agent.accessToken), payload: { resolution: 'Resolved' },
      })

      const types = await escalationEventTypes(incident.id)
      expect(types).toEqual(expect.arrayContaining(['OPENED', 'ACKNOWLEDGED', 'RESOLVED']))

      await expect(
        pool.query(`UPDATE escalation_events SET type = 'TAMPERED' WHERE escalation_id = $1`, [
          incident.id,
        ]),
      ).rejects.toThrow(/append-only/)
    })
  })

  describe('evidence release', () => {
    it('promotes to L5 and reports what the packet contains', async () => {
      const incident = (
        await app.inject({
          method: 'POST', url: `/v1/trips/${tripId}/sos`,
          headers: bearer(customer.accessToken), payload: { silent: true },
        })
      ).json()

      const res = await app.inject({
        method: 'POST', url: `/v1/admin/escalations/${incident.id}/release-evidence`,
        headers: bearer(manager.accessToken), payload: { recipient: 'Dial 112 Telangana' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().released_to).toBe('Dial 112 Telangana')
      expect(res.json().ledger_entries).toBeGreaterThan(0)
      // Vault contents are Phase 3, listed as pending rather than silently missing.
      expect(res.json().pending).toEqual(['inspection_photos', 'signed_certificate'])
      expect((await liveEscalation(tripId)).level).toBe('L5')
    })

    it('is refused to a front-line agent', async () => {
      const incident = (
        await app.inject({
          method: 'POST', url: `/v1/trips/${tripId}/sos`,
          headers: bearer(customer.accessToken), payload: { silent: true },
        })
      ).json()

      const res = await app.inject({
        method: 'POST', url: `/v1/admin/escalations/${incident.id}/release-evidence`,
        headers: bearer(agent.accessToken), payload: { recipient: 'Dial 112' },
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('RBAC and audit', () => {
    it('refuses a customer token on every Safety Desk route', async () => {
      for (const url of ['/v1/admin/stats', '/v1/admin/trips/active', '/v1/admin/escalations']) {
        const res = await app.inject({ method: 'GET', url, headers: bearer(customer.accessToken) })
        expect(res.statusCode, url).toBe(403)
      }
    })

    it('logs viewing the live board, because that is itself privacy-relevant', async () => {
      await app.inject({
        method: 'GET', url: '/v1/admin/trips/active', headers: bearer(agent.accessToken),
      })
      expect(await auditActions()).toContain('VIEW_LIVE_BOARD')
    })

    it('refuses to rewrite the audit log', async () => {
      await app.inject({
        method: 'GET', url: '/v1/admin/trips/active', headers: bearer(agent.accessToken),
      })
      await expect(pool.query(`DELETE FROM audit_log`)).rejects.toThrow(/append-only/)
    })
  })

  describe('the queue', () => {
    it('prioritises by level, then by SLA urgency', async () => {
      const second = await makeCustomer(app, '+919876543233')
      const secondDriver = await makeOnlineDriver(app, '+919848012366', { lat: 17.9, lng: 78.9 })
      const booked = await app.inject({
        method: 'POST', url: '/v1/trips/book', headers: bearer(second.accessToken),
        payload: { ...BOOK_BODY, pickup: { lat: 17.9, lng: 78.9 }, drop: { lat: 17.91, lng: 78.91 } },
      })
      const otherTrip = booked.json().id as string
      await awaitDispatchIdle()
      await app.inject({
        method: 'POST', url: `/v1/trips/${otherTrip}/offer/respond`,
        headers: bearer(secondDriver.accessToken), payload: { accept: true },
      })

      await raiseEscalation({ tripId: otherTrip, level: 'L1', reason: 'SPEED_CEILING_BREACH' })
      await raiseEscalation({ tripId, level: 'L4', reason: 'SILENT_SOS' })

      const res = await app.inject({
        method: 'GET', url: '/v1/admin/escalations', headers: bearer(agent.accessToken),
      })
      const items = res.json().items
      expect(items[0].level).toBe('L4')
      expect(items[0].trip_id).toBe(tripId)
      expect(items[1].level).toBe('L1')
    })

    it('reports SLA countdown and breaches', async () => {
      await raiseEscalation({ tripId, level: 'L4', reason: 'SILENT_SOS' })
      await pool.query(`UPDATE escalations SET sla_deadline = now() - interval '10 seconds'`)

      const res = await app.inject({
        method: 'GET', url: '/v1/admin/escalations', headers: bearer(agent.accessToken),
      })
      expect(res.json().sla_breached).toBe(1)
      expect(res.json().items[0].sla_breached).toBe(true)
      expect(res.json().items[0].sla_seconds_remaining).toBeLessThan(0)
    })

    it('summarises the desk', async () => {
      await raiseEscalation({ tripId, level: 'L4', reason: 'SILENT_SOS' })
      const res = await app.inject({
        method: 'GET', url: '/v1/admin/stats', headers: bearer(agent.accessToken),
      })

      expect(res.json().open_escalations).toBe(1)
      expect(res.json().by_level.L4).toBe(1)
      expect(res.json().active_trips).toBeGreaterThan(0)
    })
  })
})
