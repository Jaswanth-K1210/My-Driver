import { env } from '../../config/env.js'
import { TwilioSmsProvider } from './twilio.js'

export interface SmsProvider {
  send(to: string, body: string): Promise<void>
}

export class ConsoleSmsProvider implements SmsProvider {
  readonly sent: Array<{ to: string; body: string }> = []

  async send(to: string, body: string): Promise<void> {
    this.sent.push({ to, body })
    // Deliberately printed in full: this is how a developer reads the OTP locally.
    if (env.NODE_ENV !== 'test') console.log(`[sms:console] -> ${to}: ${body}`)
  }

  clear(): void {
    this.sent.length = 0
  }
}

let instance: SmsProvider | undefined

export function getSmsProvider(): SmsProvider {
  if (!instance) {
    instance = env.SMS_PROVIDER === 'twilio' ? new TwilioSmsProvider() : new ConsoleSmsProvider()
  }
  return instance
}

/** Test-only: force a specific provider instance. */
export function setSmsProvider(provider: SmsProvider | undefined): void {
  instance = provider
}
