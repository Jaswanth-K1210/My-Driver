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

  SMS_PROVIDER: z.enum(['console', 'twilio']).default('console'),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  PUSH_PROVIDER: z.enum(['console', 'fcm']).default('console'),
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),

  STORAGE_ENDPOINT: z.string().url().default('http://localhost:9000'),
  STORAGE_REGION: z.string().default('us-east-1'),
  STORAGE_BUCKET: z.string().default('mydriver'),
  STORAGE_ACCESS_KEY: z.string().default('mydriver'),
  STORAGE_SECRET_KEY: z.string().default('mydriver123'),
  STORAGE_FORCE_PATH_STYLE: boolFromEnv.default(true),

  LIVENESS_PROVIDER: z.enum(['mock']).default('mock'),
  LIVENESS_MOCK_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.97),
  LIVENESS_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.8),
})

export type Env = z.infer<typeof EnvSchema>

function load(): Env {
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  return Object.freeze(parsed.data)
}

export const env: Env = load()

export const googleClientIds = (): string[] =>
  env.GOOGLE_CLIENT_IDS.split(',').map((s) => s.trim()).filter(Boolean)
