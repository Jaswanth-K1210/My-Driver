import { env } from '../../config/env.js'
import type { AadhaarOtpResult, AadhaarResult, KycProvider, PanResult } from './index.js'

/**
 * Cashfree Verification Suite. UIDAI does not let apps verify Aadhaar
 * directly; a licensed intermediary like this one is the only legal route.
 *
 * Endpoint paths follow Cashfree's v2 Verification API. Confirm them against
 * the current docs with sandbox keys before going live.
 */
export class CashfreeKycProvider implements KycProvider {
  readonly name = 'cashfree'

  constructor() {
    if (!env.CASHFREE_CLIENT_ID || !env.CASHFREE_CLIENT_SECRET) {
      throw new Error('KYC_PROVIDER=cashfree requires CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET')
    }
  }

  private async post(path: string, body: unknown): Promise<Record<string, any>> {
    const res = await fetch(`${env.CASHFREE_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-client-id': env.CASHFREE_CLIENT_ID!,
        'x-client-secret': env.CASHFREE_CLIENT_SECRET!,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, any>
    // 4xx from Cashfree is a verdict on the input (bad PAN, wrong OTP), not an
    // outage, so it is returned for the caller to record. 5xx is thrown.
    if (res.status >= 500) throw new Error(`Cashfree ${path} failed: ${res.status}`)
    return { ...json, _status: res.status }
  }

  async verifyPan(pan: string, name: string): Promise<PanResult> {
    const r = await this.post('/pan', { pan, name })
    const valid = r._status === 200 && r.valid === true
    return {
      valid,
      registeredName: r.registered_name ?? null,
      nameMatchScore: r.name_match_score == null ? null : Math.round(Number(r.name_match_score)),
      ...(valid ? {} : { reason: r.message ?? 'PAN could not be verified' }),
    }
  }

  async requestAadhaarOtp(aadhaar: string): Promise<AadhaarOtpResult> {
    const r = await this.post('/offline-aadhaar/otp', { aadhaar_number: aadhaar })
    if (r._status !== 200 || !r.ref_id) {
      throw new Error(r.message ?? 'Aadhaar OTP could not be sent')
    }
    return { refId: String(r.ref_id) }
  }

  async verifyAadhaarOtp(refId: string, otp: string): Promise<AadhaarResult> {
    const r = await this.post('/offline-aadhaar/verify', { ref_id: refId, otp })
    const valid = r._status === 200 && r.status === 'VALID'
    return {
      valid,
      name: r.name ?? null,
      ...(valid ? {} : { reason: r.message ?? 'Aadhaar could not be verified' }),
    }
  }
}
