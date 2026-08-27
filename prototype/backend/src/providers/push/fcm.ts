import { createSign } from 'node:crypto'
import { env } from '../../config/env.js'
import { pool } from '../../db/client.js'
import type { PushPayload, PushProvider } from './index.js'

type ServiceAccount = {
  client_email: string
  private_key: string
  project_id: string
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'

const b64url = (input: Buffer | string): string =>
  Buffer.from(input).toString('base64url')

/**
 * Firebase Cloud Messaging over the HTTP v1 API.
 *
 * Access tokens are minted from the service account with a signed JWT — no
 * extra dependency needed — and cached until shortly before they expire.
 *
 * Device tokens come from the `device_tokens` table, which is populated by
 * POST /v1/me/devices. A token FCM rejects as UNREGISTERED is deleted, because
 * an app that was uninstalled will never come back on that token.
 */
export class FcmPushProvider implements PushProvider {
  private readonly account: ServiceAccount
  private token: { value: string; expiresAt: number } | null = null

  constructor() {
    if (!env.FCM_SERVICE_ACCOUNT_JSON) {
      throw new Error('PUSH_PROVIDER=fcm requires FCM_SERVICE_ACCOUNT_JSON')
    }
    try {
      this.account = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON) as ServiceAccount
    } catch {
      throw new Error('FCM_SERVICE_ACCOUNT_JSON is not valid JSON')
    }
    if (!this.account.client_email || !this.account.private_key || !this.account.project_id) {
      throw new Error('FCM_SERVICE_ACCOUNT_JSON is missing client_email, private_key or project_id')
    }
  }

  /** Self-signed JWT exchanged for an OAuth access token. */
  private async accessToken(): Promise<string> {
    // 60 seconds of slack so a token never expires mid-flight.
    if (this.token && this.token.expiresAt - 60_000 > Date.now()) return this.token.value

    const now = Math.floor(Date.now() / 1000)
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const claims = b64url(
      JSON.stringify({
        iss: this.account.client_email,
        scope: FCM_SCOPE,
        aud: GOOGLE_TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    )

    const signature = createSign('RSA-SHA256')
      .update(`${header}.${claims}`)
      .sign(this.account.private_key)
    const assertion = `${header}.${claims}.${b64url(signature)}`

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    })

    if (!res.ok) throw new Error(`FCM token exchange failed: ${res.status} ${await res.text()}`)

    const body = (await res.json()) as { access_token: string; expires_in: number }
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 }
    return body.access_token
  }

  async send(userId: string, payload: PushPayload): Promise<void> {
    const { rows } = await pool.query<{ token: string }>(
      `SELECT token FROM device_tokens WHERE user_id = $1`,
      [userId],
    )
    // Nobody has registered a device: not an error, just nothing to do.
    if (rows.length === 0) return

    const accessToken = await this.accessToken()
    const url = `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`

    for (const { token } of rows) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: payload.title, body: payload.body },
            ...(payload.data ? { data: payload.data } : {}),
            android: { priority: 'HIGH' },
            apns: { headers: { 'apns-priority': '10' } },
          },
        }),
      })

      if (res.ok) continue

      const text = await res.text()
      // A dead token will never revive; drop it rather than retrying forever.
      if (res.status === 404 || text.includes('UNREGISTERED') || text.includes('INVALID_ARGUMENT')) {
        await pool.query(`DELETE FROM device_tokens WHERE user_id = $1 AND token = $2`, [
          userId,
          token,
        ])
        continue
      }
      throw new Error(`FCM send failed: ${res.status} ${text}`)
    }
  }
}
