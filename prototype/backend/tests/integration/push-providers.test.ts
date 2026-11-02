import { createVerify, generateKeyPairSync } from 'node:crypto'
import { createServer, type Http2Server } from 'node:http2'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildApp } from '../../src/app.js'
import { pool } from '../../src/db/client.js'
import { ApnsClient } from '../../src/providers/push/apns.js'
import { FcmPushProvider, isDeadFcmToken } from '../../src/providers/push/fcm.js'
import { loginAs } from '../helpers/auth.js'
import { resetDb } from '../helpers/db.js'
import { resetRedis } from '../helpers/redis.js'

const PUSH = { title: 'Trip started', body: 'Your trip is under way.', data: { type: 'TRIP_STARTED' } }

describe('isDeadFcmToken (M-6)', () => {
  it('drops a token only when FCM says the app is gone', () => {
    expect(isDeadFcmToken(404, '')).toBe(true)
    expect(isDeadFcmToken(404, JSON.stringify({ error: { details: [{ errorCode: 'UNREGISTERED' }] } }))).toBe(true)
    expect(isDeadFcmToken(400, JSON.stringify({ error: { status: 'INVALID_ARGUMENT', details: [{ errorCode: 'INVALID_ARGUMENT' }] } }))).toBe(false)
    expect(isDeadFcmToken(500, 'Internal error')).toBe(false)
  })
})

describe('push: FCM for Android, APNs for iOS (D-1)', () => {
  let app: FastifyInstance
  let userId: string
  let apnsServer: Http2Server
  let apns: ApnsClient
  const apnsSeen: Array<{ token: string; topic: string; body: unknown }> = []
  const fcmSeen: string[] = []

  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()

    // Stands in for api.push.apple.com, and checks what Apple would check.
    apnsServer = createServer((req, res) => {
      let raw = ''
      req.on('data', (c) => (raw += c))
      req.on('end', () => {
        const [h, c, sig] = String(req.headers.authorization).replace('bearer ', '').split('.')
        const signed = createVerify('SHA256')
          .update(`${h}.${c}`)
          .verify({ key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig!, 'base64url'))
        const token = String(req.headers[':path']).replace('/3/device/', '')
        const topic = String(req.headers['apns-topic'])
        apnsSeen.push({ token, topic, body: JSON.parse(raw) })
        const reply = (status: number, reason?: string) => {
          res.writeHead(status)
          res.end(reason ? JSON.stringify({ reason }) : '')
        }
        if (!signed) return reply(403, 'InvalidProviderToken')
        if (token === 'ios-uninstalled') return reply(410, 'Unregistered')
        if (token === 'ios-driver-app' && topic !== 'com.mydriver.driver') return reply(400, 'DeviceTokenNotForTopic')
        if (token === 'ios-wrong-env') return reply(400, 'BadDeviceToken')
        reply(200)
      })
    })
    await new Promise<void>((r) => apnsServer.listen(0, r))
    apns = new ApnsClient({
      keyP8: ec.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      keyId: 'KEY123',
      teamId: 'TEAM123',
      topics: ['com.mydriver.user', 'com.mydriver.driver'],
      production: false,
      origin: `http://localhost:${(apnsServer.address() as AddressInfo).port}`,
    })
  })

  beforeEach(async () => {
    await resetDb()
    await resetRedis()
    userId = (await loginAs(app, '+919811100001', 'CUSTOMER')).userId
    apnsSeen.length = 0
    fcmSeen.length = 0
    // FCM: an OAuth token, then one send per Android device.
    vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
      if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'a', expires_in: 3600 }))
      const token = (JSON.parse(init.body) as { message: { token: string } }).message.token
      fcmSeen.push(token)
      if (token === 'android-uninstalled') {
        return new Response(JSON.stringify({ error: { details: [{ errorCode: 'UNREGISTERED' }] } }), { status: 404 })
      }
      if (token === 'android-bad-message') {
        return new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT' } }), { status: 400 })
      }
      return new Response('{}')
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  afterAll(async () => {
    apns.close()
    await new Promise((r) => apnsServer.close(r))
    await app.close()
  })

  const register = (platform: string, token: string) =>
    pool.query(`INSERT INTO device_tokens (user_id, platform, token) VALUES ($1, $2, $3)`, [userId, platform, token])
  const tokens = async () =>
    (await pool.query<{ token: string }>(`SELECT token FROM device_tokens WHERE user_id = $1 ORDER BY token`, [userId]))
      .rows.map((r) => r.token)
  const provider = (withApns = true) =>
    new FcmPushProvider({
      account: {
        client_email: 'push@example.iam.gserviceaccount.com',
        private_key: rsa.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        project_id: 'mydriver-test',
      },
      apns: withApns ? apns : null,
    })

  it('sends iOS tokens to Apple and Android tokens to FCM', async () => {
    await register('ios', 'ios-ok')
    await register('android', 'android-ok')

    await provider().send(userId, PUSH)

    expect(fcmSeen).toEqual(['android-ok'])
    expect(apnsSeen).toEqual([
      {
        token: 'ios-ok',
        topic: 'com.mydriver.user',
        body: { aps: { alert: { title: PUSH.title, body: PUSH.body }, sound: 'default' }, type: 'TRIP_STARTED' },
      },
    ])
  })

  it('tries the next app when a token belongs to another one', async () => {
    await register('ios', 'ios-driver-app')
    await provider().send(userId, PUSH)
    expect(apnsSeen.map((s) => s.topic)).toEqual(['com.mydriver.user', 'com.mydriver.driver'])
    expect(await tokens()).toEqual(['ios-driver-app'])
  })

  it('deletes tokens only for uninstalled apps', async () => {
    for (const [platform, token] of [
      ['ios', 'ios-uninstalled'],
      ['ios', 'ios-wrong-env'],
      ['android', 'android-uninstalled'],
      ['android', 'android-bad-message'],
    ] as const) await register(platform, token)

    await provider().send(userId, PUSH).catch(() => undefined)

    expect(await tokens()).toEqual(['android-bad-message', 'ios-wrong-env'])
  })

  it('keeps iOS tokens, and never sends them to FCM, when no APNs key is set', async () => {
    await register('ios', 'ios-ok')
    await provider(false).send(userId, PUSH)
    expect(fcmSeen).toEqual([])
    expect(await tokens()).toEqual(['ios-ok'])
  })
})
