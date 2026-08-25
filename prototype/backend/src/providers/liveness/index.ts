import { env } from '../../config/env.js'

export type LivenessResult = { match: boolean; confidence: number }

export interface LivenessProvider {
  verify(selfie: Buffer, referenceKey: string | null): Promise<LivenessResult>
}

/**
 * Phase 1 ships no face-matching vendor. The mock returns a configurable
 * confidence so the handshake gate, the threshold check and the failure path
 * are all exercised for real rather than hardcoded to pass.
 */
export class MockLivenessProvider implements LivenessProvider {
  constructor(private readonly confidence: number = env.LIVENESS_MOCK_CONFIDENCE) {}

  async verify(selfie: Buffer): Promise<LivenessResult> {
    if (selfie.length === 0) return { match: false, confidence: 0 }
    return {
      match: this.confidence >= env.LIVENESS_MIN_CONFIDENCE,
      confidence: this.confidence,
    }
  }
}

let instance: LivenessProvider | undefined

export function getLivenessProvider(): LivenessProvider {
  if (!instance) instance = new MockLivenessProvider()
  return instance
}

export function setLivenessProvider(provider: LivenessProvider | undefined): void {
  instance = provider
}
