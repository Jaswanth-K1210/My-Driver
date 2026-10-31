import { defineConfig, devices } from '@playwright/test'

// End-to-end tests for the customer site and the console (docs/testing-plan.md §5).
// Needs the backend's Docker stack, migrated and seeded:
//   cd ../backend && npm run infra:up && npm run db:migrate && npm run db:seed
// Then: npm run e2e. Stop your own API on :4000 first; Playwright starts one
// so it can read OTPs from its log.
export default defineConfig({
  testDir: './e2e',
  // One worker: development dispatch offers any trip to any online driver
  // within 250 km, so parallel tests would take each other's offers.
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.js',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'cd ../backend && MAPS_PROVIDER=mock PAY_AFTER_TRIP=false npx tsx src/index.ts > ../website/e2e/.api.log 2>&1',
      url: 'http://localhost:4000/health',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    { command: 'npx vite --port 5173 --strictPort', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI },
    {
      command: 'VITE_APP_TARGET=admin npx vite --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
    },
  ],
})
