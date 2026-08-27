import { env } from '../../config/env.js'

export type CallResult = { sid: string; status: string }

export interface VoiceProvider {
  /** Places an automated voice call (IVR) and returns immediately. */
  call(to: string, message: string): Promise<CallResult>
}

export class ConsoleVoiceProvider implements VoiceProvider {
  readonly calls: Array<{ to: string; message: string }> = []

  async call(to: string, message: string): Promise<CallResult> {
    this.calls.push({ to, message })
    if (env.NODE_ENV !== 'test') console.log(`[voice:console] -> ${to}: ${message}`)
    return { sid: `console-${Date.now()}`, status: 'queued' }
  }

  clear(): void {
    this.calls.length = 0
  }
}

/**
 * Twilio Programmable Voice. Kept behind the same interface as SMS so the
 * Safety Desk's one-click call works identically in development.
 */
export class TwilioVoiceProvider implements VoiceProvider {
  constructor() {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) {
      throw new Error('VOICE_PROVIDER=twilio requires the TWILIO_* variables')
    }
  }

  async call(to: string, message: string): Promise<CallResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Calls.json`
    const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: to,
        From: env.TWILIO_FROM_NUMBER!,
        Twiml: `<Response><Say>${message}</Say></Response>`,
      }),
    })

    if (!res.ok) throw new Error(`Twilio call failed: ${res.status} ${await res.text()}`)
    const body = (await res.json()) as { sid: string; status: string }
    return { sid: body.sid, status: body.status }
  }
}

let instance: VoiceProvider | undefined

export function getVoiceProvider(): VoiceProvider {
  if (!instance) {
    instance = env.VOICE_PROVIDER === 'twilio' ? new TwilioVoiceProvider() : new ConsoleVoiceProvider()
  }
  return instance
}

export function setVoiceProvider(provider: VoiceProvider | undefined): void {
  instance = provider
}
