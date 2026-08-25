import { env } from '../../config/env.js'
import type { PushPayload, PushProvider } from './index.js'

/**
 * Phase 1 does not persist device tokens — no client registers one yet.
 * This adapter exists so the seam is real; wiring device-token storage belongs
 * with the Phase 2 escalation engine.
 */
export class FcmPushProvider implements PushProvider {
  constructor() {
    if (!env.FCM_SERVICE_ACCOUNT_JSON) {
      throw new Error('PUSH_PROVIDER=fcm requires FCM_SERVICE_ACCOUNT_JSON')
    }
  }

  async send(userId: string, payload: PushPayload): Promise<void> {
    throw new Error(
      `FCM delivery is not implemented in Phase 1 (attempted send to ${userId}: ${payload.title})`,
    )
  }
}
