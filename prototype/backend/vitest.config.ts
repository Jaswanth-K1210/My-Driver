import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration and realtime tests share one Postgres and one Redis.
    fileParallelism: false,
    globalTeardown: ['./tests/helpers/teardown.ts'],
    hookTimeout: 30_000,
    testTimeout: 20_000,
  },
})
