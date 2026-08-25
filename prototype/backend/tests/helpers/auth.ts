import type { FastifyInstance } from 'fastify'
import { ConsoleSmsProvider, setSmsProvider } from '../../src/providers/sms/index.js'

export type Role = 'CUSTOMER' | 'DRIVER' | 'AGENT' | 'ADMIN'

/**
 * Complete a real OTP login and return the resulting identity. Every later
 * integration test uses this instead of forging tokens, so the auth path is
 * exercised on every run.
 *
 * Note: this consumes OTP quota (3 per phone per 15 min). A test needing more
 * logins for the same phone must call resetRedis() in between.
 */
export async function loginAs(
  app: FastifyInstance,
  phone: string,
  role: Role,
): Promise<{ userId: string; accessToken: string; refreshToken: string }> {
  const sms = new ConsoleSmsProvider()
  setSmsProvider(sms)

  const requested = await app.inject({
    method: 'POST',
    url: '/v1/auth/otp/request',
    payload: { phone_number: phone, role },
  })
  if (requested.statusCode !== 200) {
    throw new Error(`loginAs otp/request failed: ${requested.statusCode} ${requested.payload}`)
  }

  const code = sms.sent.at(-1)!.body.match(/\b(\d{6})\b/)![1]!

  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/otp/verify',
    payload: { phone_number: phone, otp: code, role },
  })
  if (res.statusCode !== 200) {
    throw new Error(`loginAs otp/verify failed: ${res.statusCode} ${res.payload}`)
  }

  const body = res.json()
  return {
    userId: body.user.id,
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
  }
}

export const bearer = (token: string): Record<string, string> => ({
  authorization: `Bearer ${token}`,
})
