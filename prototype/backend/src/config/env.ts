import { existsSync } from 'node:fs'
import { z } from 'zod'

// Node loads .env only when asked. Real environment variables always win:
// loadEnvFile does not overwrite anything already set in process.env.
if (existsSync('.env')) {
  try {
    process.loadEnvFile('.env')
  } catch {
    // A malformed or unreadable .env must not stop a container that already
    // has its configuration injected as real environment variables.
  }
}

/**
 * z.coerce.boolean() is wrong for environment variables: it applies JS
 * truthiness, so the string "false" becomes true. Parse the actual word.
 */
const boolFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((v) =>
    typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase()),
  )

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().url(),
  DATABASE_MIGRATION_URL: z.string().url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  REDIS_URL: z.string().min(1),
  REDIS_CLUSTER: boolFromEnv.default(false),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  TOKEN_PEPPER: z.string().min(32, 'TOKEN_PEPPER must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(2_592_000),

  GOOGLE_CLIENT_IDS: z.string().default(''),

  // Comma-separated browser origins allowed to call the API. Native apps are
  // unaffected: CORS is a browser policy and Expo does not send an Origin.
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174'),

  SMS_PROVIDER: z.enum(['console', 'twilio']).default('console'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  VOICE_PROVIDER: z.enum(['console', 'twilio']).default('console'),

  PUSH_PROVIDER: z.enum(['console', 'fcm']).default('console'),
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),

  STORAGE_ENDPOINT: z.string().url().default('http://localhost:9000'),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_BUCKET: z.string().default('mydriver'),
  STORAGE_ACCESS_KEY: z.string().default('mydriver'),
  STORAGE_SECRET_KEY: z.string().default('mydriver123'),
  STORAGE_FORCE_PATH_STYLE: boolFromEnv.default(true),

  // Base URL the guardian tracking link points at (the public website).
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:5173'),
  // The operations console's own origin (its separate subdomain). Staff
  // sign-in from a browser is accepted only from here.
  ADMIN_WEB_URL: z.string().url().default('http://localhost:5174'),

  LIVENESS_PROVIDER: z.enum(['mock']).default('mock'),
  LIVENESS_MOCK_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.97),
  LIVENESS_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.8),

  KYC_PROVIDER: z.enum(['mock', 'cashfree']).default('mock'),
  CASHFREE_BASE_URL: z.string().url().default('https://sandbox.cashfree.com/verification'),
  CASHFREE_CLIENT_ID: z.string().optional(),
  CASHFREE_CLIENT_SECRET: z.string().optional(),
  // Cashfree scores 0-100. Below this the PAN holder's name does not match the
  // account holder closely enough to call the person verified.
  KYC_MIN_NAME_MATCH: z.coerce.number().int().min(0).max(100).default(80),

  // 'none' dispatches at booking with no payment step: the pre-payments
  // behaviour, kept so the trip test suite does not need a checkout per trip.
  PAYMENTS_PROVIDER: z.enum(['none', 'mock', 'razorpay']).default('none'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  MAPS_PROVIDER: z.enum(['mock', 'google']).default('mock'),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  // Seconds a search result is served from Redis before asking Google again.
  LOCATION_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),

  // Whether the operations console shows the seeded demo data (npm run
  // seed:demo). Production always hides it, whatever this says.
  ADMIN_DEMO_DATA: z.enum(['show', 'hide']).default('show'),

  // When set, GET /metrics requires `Authorization: Bearer <token>`.
  // Required in production: the metrics expose internal load figures.
  METRICS_TOKEN: z.string().min(24).optional(),

  // Public base URL of this API, used to build the hosted checkout link.
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
})

export type Env = z.infer<typeof EnvSchema>

/**
 * What would make this configuration unsafe to serve real customers.
 * `errors` stop the boot: money, identity, secrets and public URLs. `warnings`
 * are real gaps that still allow a launch (a stub face-match, no push).
 * Exported so the rules are unit-tested rather than discovered in production.
 */
export function productionProblems(e: Env): { errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []
  const isDevSecret = (v: string) => /dev-only|change-me/i.test(v)

  if (isDevSecret(e.JWT_SECRET)) errors.push('JWT_SECRET is the development value; generate a new random secret')
  if (isDevSecret(e.TOKEN_PEPPER)) errors.push('TOKEN_PEPPER is the development value; generate a new random secret')
  if (/\/\/mydriver:mydriver@/.test(e.DATABASE_URL) || /\/\/mydriver:mydriver@/.test(e.DATABASE_MIGRATION_URL)) {
    errors.push('Database URLs use the development password')
  }
  if (e.STORAGE_ACCESS_KEY === 'mydriver' || e.STORAGE_SECRET_KEY === 'mydriver123') {
    errors.push('STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY are the development values')
  }
  if (e.SMS_PROVIDER === 'console') errors.push('SMS_PROVIDER=console prints OTPs to the log instead of sending them')
  if (e.KYC_PROVIDER === 'mock') errors.push('KYC_PROVIDER=mock accepts any PAN and a fixed Aadhaar OTP')
  if (e.PAYMENTS_PROVIDER !== 'razorpay') errors.push(`PAYMENTS_PROVIDER=${e.PAYMENTS_PROVIDER}: production must take real payments (razorpay)`)
  for (const [name, url] of [['PUBLIC_WEB_URL', e.PUBLIC_WEB_URL], ['PUBLIC_API_URL', e.PUBLIC_API_URL], ['ADMIN_WEB_URL', e.ADMIN_WEB_URL]] as const) {
    if (!url.startsWith('https://')) errors.push(`${name} must be an https:// URL`)
  }
  const origins = e.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  if (origins.length === 0 || origins.some((o) => /localhost|127\.0\.0\.1/.test(o) || !o.startsWith('https://'))) {
    errors.push('CORS_ORIGINS must list only your https website origins')
  }
  if (!origins.includes(new URL(e.ADMIN_WEB_URL).origin)) {
    errors.push('CORS_ORIGINS must include the admin console origin (ADMIN_WEB_URL)')
  }
  if (new URL(e.ADMIN_WEB_URL).origin === new URL(e.PUBLIC_WEB_URL).origin) {
    errors.push('ADMIN_WEB_URL must be its own subdomain, not the customer website')
  }
  if (!e.METRICS_TOKEN) errors.push('METRICS_TOKEN is required so /metrics is not public')

  if (e.LIVENESS_PROVIDER === 'mock') warnings.push('LIVENESS_PROVIDER=mock: the pickup selfie is captured but not face-matched')
  if (e.PUSH_PROVIDER === 'console') warnings.push('PUSH_PROVIDER=console: no push notifications are delivered')
  if (e.VOICE_PROVIDER === 'console') warnings.push('VOICE_PROVIDER=console: Safety Desk calls are logged, not placed')
  if (e.MAPS_PROVIDER === 'mock') warnings.push('MAPS_PROVIDER=mock: place search only knows a few built-in places')
  return { errors, warnings }
}

function load(): Env {
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  if (parsed.data.NODE_ENV === 'production') {
    const { errors, warnings } = productionProblems(parsed.data)
    for (const w of warnings) console.warn(`[config] WARNING: ${w}`)
    if (errors.length) {
      throw new Error(`Refusing to start in production:\n${errors.map((x) => `  - ${x}`).join('\n')}`)
    }
  }
  return Object.freeze(parsed.data)
}

export const env: Env = load()

export const googleClientIds = (): string[] =>
  env.GOOGLE_CLIENT_IDS.split(',').map((s) => s.trim()).filter(Boolean)

/** True when console queries should include demo accounts and their trips. */
export const showDemoData = (): boolean => env.NODE_ENV !== 'production' && env.ADMIN_DEMO_DATA === 'show'

export const corsOrigins = (): string[] =>
  env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
