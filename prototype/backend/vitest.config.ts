import { existsSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

// Tests truncate every table and clear the service's Redis keys between
// cases, so they must never share the developer's database. Same server and
// credentials as .env (or CI), different database and Redis DB.
if (existsSync('.env')) process.loadEnvFile('.env')
const source = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL
const testDb = source ? Object.assign(new URL(source), { pathname: '/mydriver_test' }).toString() : undefined
// Place search must not reach a real (paid or fair-use) provider from tests.
process.env.MAPS_PROVIDER = 'mock'
// Straight to Postgres: PgBouncer only routes the dev database.
if (testDb) process.env.DATABASE_URL = process.env.DATABASE_MIGRATION_URL = testDb
if (process.env.REDIS_URL && !/^(1|true)$/.test(process.env.REDIS_CLUSTER ?? '')) {
  process.env.REDIS_URL = Object.assign(new URL(process.env.REDIS_URL), { pathname: '/1' }).toString()
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration and realtime tests share one Postgres and one Redis.
    fileParallelism: false,
    globalSetup: ['./tests/helpers/global-setup.ts'],
    globalTeardown: ['./tests/helpers/teardown.ts'],
    hookTimeout: 30_000,
    testTimeout: 20_000,
  },
})
