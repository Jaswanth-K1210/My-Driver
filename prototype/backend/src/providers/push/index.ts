import { env } from '../../config/env.js'
import { FcmPushProvider } from './fcm.js'

export type PushPayload = {
  title: string
  body: string
  data?: Record<string, string>
  /**
   * Android notification channel the app has created (the driver app's
   * 'offers' channel carries the alert sound and vibration). Omit it and the
   * app's default channel is used.
   */
  channel?: string
}

export interface PushProvider {
  send(userId: string, payload: PushPayload): Promise<void>
}

export class ConsolePushProvider implements PushProvider {
  readonly sent: Array<{ userId: string; payload: PushPayload }> = []

  async send(userId: string, payload: PushPayload): Promise<void> {
    this.sent.push({ userId, payload })
    if (env.NODE_ENV !== 'test') {
      console.log(`[push:console] -> ${userId}: ${payload.title} — ${payload.body}`)
    }
  }

  clear(): void {
    this.sent.length = 0
  }
}

let instance: PushProvider | undefined

export function getPushProvider(): PushProvider {
  if (!instance) {
    instance = env.PUSH_PROVIDER === 'fcm' ? new FcmPushProvider() : new ConsolePushProvider()
  }
  return instance
}

export function setPushProvider(provider: PushProvider | undefined): void {
  instance = provider
}
