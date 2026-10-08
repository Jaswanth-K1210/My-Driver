import { env } from '../../config/env.js'
import { CashfreeKycProvider } from './cashfree.js'

export type PanResult = {
  valid: boolean
  registeredName: string | null
  /** 0-100, how closely the supplied name matches the PAN record. */
  nameMatchScore: number | null
  reason?: string
}

export type AadhaarOtpResult = { refId: string }

export type AadhaarResult = { valid: boolean; name: string | null; reason?: string }

export interface KycProvider {
  readonly name: string
  verifyPan(pan: string, name: string): Promise<PanResult>
  requestAadhaarOtp(aadhaar: string): Promise<AadhaarOtpResult>
  verifyAadhaarOtp(refId: string, otp: string): Promise<AadhaarResult>
}

export const MOCK_AADHAAR_OTP = '123456'

/**
 * Deterministic stand-in for local development and tests. A PAN whose fourth
 * character is not 'P' (an individual) is reported invalid, which gives tests
 * a real failure path without a network call.
 */
export class MockKycProvider implements KycProvider {
  readonly name = 'mock'
  private readonly otps = new Map<string, string>()

  async verifyPan(pan: string, name: string): Promise<PanResult> {
    if (pan[3] !== 'P') {
      return { valid: false, registeredName: null, nameMatchScore: null, reason: 'Not an individual PAN' }
    }
    return { valid: true, registeredName: name.toUpperCase(), nameMatchScore: 100 }
  }

  async requestAadhaarOtp(aadhaar: string): Promise<AadhaarOtpResult> {
    const refId = `mock-${aadhaar.slice(-4)}-${Date.now()}`
    this.otps.set(refId, MOCK_AADHAAR_OTP)
    return { refId }
  }

  async verifyAadhaarOtp(refId: string, otp: string): Promise<AadhaarResult> {
    const expected = this.otps.get(refId)
    if (!expected) return { valid: false, name: null, reason: 'OTP session expired' }
    if (otp !== expected) return { valid: false, name: null, reason: 'Incorrect OTP' }
    this.otps.delete(refId)
    return { valid: true, name: 'MOCK AADHAAR HOLDER' }
  }
}

let instance: KycProvider | undefined

export function getKycProvider(): KycProvider {
  if (!instance) {
    instance = env.KYC_PROVIDER === 'cashfree' ? new CashfreeKycProvider() : new MockKycProvider()
  }
  return instance
}

/** Test-only: force a specific provider instance. */
export function setKycProvider(provider: KycProvider | undefined): void {
  instance = provider
}
