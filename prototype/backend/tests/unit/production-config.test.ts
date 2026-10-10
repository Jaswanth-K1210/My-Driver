import { describe, expect, it } from 'vitest'
import { env, productionProblems, type Env } from '../../src/config/env.js'

const SAFE: Env = {
  ...env,
  NODE_ENV: 'production',
  JWT_SECRET: 'k'.repeat(48),
  TOKEN_PEPPER: 'p'.repeat(48),
  DATABASE_URL: 'postgres://app:s3cret@db:6432/mydriver',
  DATABASE_MIGRATION_URL: 'postgres://app:s3cret@db:5432/mydriver',
  STORAGE_ACCESS_KEY: 'AKIAREAL',
  STORAGE_SECRET_KEY: 'real-secret',
  SMS_PROVIDER: 'twilio',
  KYC_PROVIDER: 'cashfree',
  PAYMENTS_PROVIDER: 'razorpay',
  PUBLIC_WEB_URL: 'https://mydriver.in',
  PUBLIC_API_URL: 'https://api.mydriver.in',
  ADMIN_WEB_URL: 'https://admin.mydriver.in',
  CORS_ORIGINS: 'https://mydriver.in,https://www.mydriver.in,https://admin.mydriver.in',
  METRICS_TOKEN: 'm'.repeat(32),
  MAPS_PROVIDER: 'google',
  PUSH_PROVIDER: 'fcm',
  VOICE_PROVIDER: 'twilio',
}

describe('production configuration guard', () => {
  it('accepts a fully configured production environment', () => {
    expect(productionProblems(SAFE).errors).toEqual([])
  })

  it.each([
    ['dev JWT secret', { JWT_SECRET: 'dev-only-secret-change-me-at-least-32-chars' }, 'JWT_SECRET'],
    ['dev database password', { DATABASE_URL: 'postgres://mydriver:mydriver@db:6432/mydriver' }, 'Database'],
    ['console SMS', { SMS_PROVIDER: 'console' }, 'SMS_PROVIDER'],
    ['mock KYC', { KYC_PROVIDER: 'mock' }, 'KYC_PROVIDER'],
    ['mock payments', { PAYMENTS_PROVIDER: 'mock' }, 'PAYMENTS_PROVIDER'],
    ['payments off', { PAYMENTS_PROVIDER: 'none' }, 'PAYMENTS_PROVIDER'],
    ['http public URL', { PUBLIC_API_URL: 'http://api.mydriver.in' }, 'PUBLIC_API_URL'],
    ['localhost CORS', { CORS_ORIGINS: 'https://mydriver.in,http://localhost:5173' }, 'CORS_ORIGINS'],
    ['public metrics', { METRICS_TOKEN: undefined }, 'METRICS_TOKEN'],
    ['admin origin missing from CORS', { CORS_ORIGINS: 'https://mydriver.in' }, 'admin console origin'],
    ['admin on the customer domain', { ADMIN_WEB_URL: 'https://mydriver.in' }, 'own subdomain'],
  ] as const)('refuses to start with %s', (_label, patch, mentions) => {
    const { errors } = productionProblems({ ...SAFE, ...patch } as Env)
    expect(errors.join('\n')).toContain(mentions)
  })

  it('warns, but allows, the stub face match', () => {
    const r = productionProblems({ ...SAFE, LIVENESS_PROVIDER: 'mock' })
    expect(r.errors).toEqual([])
    expect(r.warnings.join()).toContain('LIVENESS_PROVIDER')
  })
})
