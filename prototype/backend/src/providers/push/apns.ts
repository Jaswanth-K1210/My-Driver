import { createSign } from 'node:crypto'
import { connect, type ClientHttp2Session } from 'node:http2'
import { env } from '../../config/env.js'
import type { PushPayload } from './index.js'

export type ApnsConfig = {
  /** The .p8 auth key from the Apple Developer account, PEM text. */
  keyP8: string
  keyId: string
  teamId: string
  /**
   * Bundle IDs to try, in order. One key serves every app on the team, but
   * a device token belongs to one app, and device_tokens does not record
   * which, so a token Apple rejects for one topic is tried on the next.
   */
  topics: string[]
  production: boolean
  /** Overrides the Apple host; tests point it at a local server. */
  origin?: string
}

/** `unregistered`: the app is gone from that phone, so the token can be deleted. */
export type ApnsResult = 'sent' | 'unregistered' | 'failed'

const SEND_TIMEOUT_MS = 5_000
// Apple refuses tokens older than an hour and throttles ones minted more
// often than every 20 minutes.
const JWT_TTL_MS = 50 * 60_000

const b64url = (input: Buffer | string): string => Buffer.from(input).toString('base64url')

/**
 * Apple Push Notification service over HTTP/2 with token auth (decision D-1).
 *
 * The iOS apps register the raw APNs device token, which FCM cannot address,
 * so iOS pushes go to Apple directly. No dependency: node:http2 plus an
 * ES256 JWT signed with node:crypto.
 */
export class ApnsClient {
  private readonly origin: string
  private session: ClientHttp2Session | null = null
  private jwt: { value: string; mintedAt: number } | null = null

  constructor(private readonly config: ApnsConfig) {
    this.origin =
      config.origin ?? (config.production ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com')
  }

  private token(): string {
    if (this.jwt && Date.now() - this.jwt.mintedAt < JWT_TTL_MS) return this.jwt.value
    const header = b64url(JSON.stringify({ alg: 'ES256', kid: this.config.keyId }))
    const claims = b64url(JSON.stringify({ iss: this.config.teamId, iat: Math.floor(Date.now() / 1000) }))
    const signature = createSign('SHA256')
      .update(`${header}.${claims}`)
      .sign({ key: this.config.keyP8, dsaEncoding: 'ieee-p1363' })
    this.jwt = { value: `${header}.${claims}.${b64url(signature)}`, mintedAt: Date.now() }
    return this.jwt.value
  }

  private connection(): ClientHttp2Session {
    if (!this.session || this.session.closed || this.session.destroyed) {
      const session = connect(this.origin)
      // A dropped connection is reopened on the next send; never crash on it.
      session.on('error', () => undefined)
      session.on('close', () => {
        if (this.session === session) this.session = null
      })
      session.unref()
      this.session = session
    }
    return this.session
  }

  private post(topic: string, deviceToken: string, body: string): Promise<{ status: number; reason: string | null }> {
    return new Promise((resolve, reject) => {
      const req = this.connection().request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${this.token()}`,
        'apns-topic': topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      })
      req.setTimeout(SEND_TIMEOUT_MS, () => req.close())
      let status = 0
      let text = ''
      req.on('response', (headers) => {
        status = Number(headers[':status'])
      })
      req.setEncoding('utf8')
      req.on('data', (chunk: string) => {
        text += chunk
      })
      req.on('end', () => {
        let reason: string | null = null
        try {
          reason = text ? ((JSON.parse(text) as { reason?: string }).reason ?? null) : null
        } catch {
          // Not JSON: the status alone decides.
        }
        resolve({ status, reason })
      })
      req.on('error', reject)
      req.end(body)
    })
  }

  async send(deviceToken: string, payload: PushPayload): Promise<ApnsResult> {
    const body = JSON.stringify({
      aps: { alert: { title: payload.title, body: payload.body }, sound: 'default' },
      // Same keys the apps read from an FCM data message.
      ...payload.data,
    })
    for (const topic of this.config.topics) {
      const { status, reason } = await this.post(topic, deviceToken, body)
      if (status === 200) return 'sent'
      if (status === 410) return 'unregistered'
      if (reason === 'DeviceTokenNotForTopic') continue
      // BadDeviceToken is most often a sandbox token sent to production (or
      // the reverse): a config problem, not a dead phone. Keep the token.
      console.error('APNs send failed', status, reason)
      return 'failed'
    }
    console.error('APNs send failed: token matches none of APNS_TOPICS')
    return 'failed'
  }

  close(): void {
    this.session?.close()
    this.session = null
  }
}

/** The APNs client from the environment, or null when no key is configured. */
export function apnsFromEnv(): ApnsClient | null {
  if (!env.APNS_KEY_P8 || !env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_TOPICS) return null
  return new ApnsClient({
    // Env files cannot hold a multi-line PEM easily; accept "\n" escapes.
    keyP8: env.APNS_KEY_P8.replaceAll('\\n', '\n'),
    keyId: env.APNS_KEY_ID,
    teamId: env.APNS_TEAM_ID,
    topics: env.APNS_TOPICS.split(',').map((t) => t.trim()).filter(Boolean),
    production: env.APNS_PRODUCTION,
  })
}
