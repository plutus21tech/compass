import { defineConfig, devices } from '@playwright/test'
import { E2E_BASE_URL, E2E_PORT, academyE2eSkipReason } from './e2e/academy-env'

// The Academy E2E run: `npm run test:e2e:academy`. A server starts only when the guard in
// e2e/academy-env.ts passes, so a missing flag or a non-test database never reaches `next dev`.
const skipReason = academyE2eSkipReason()
if (skipReason) console.warn(`[e2e] Skipping Academy E2E: ${skipReason}`)

export default defineConfig({
  testDir: './e2e',
  // One worker: both projects share the same fictional fixture rows.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: { baseURL: E2E_BASE_URL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: skipReason
    ? undefined
    : {
        command: `npx next dev -p ${E2E_PORT}`,
        url: `${E2E_BASE_URL}/login`,
        timeout: 180_000,
        reuseExistingServer: false,
        env: {
          ...(process.env as Record<string, string>),
          SESSION_SECRET: process.env.SESSION_SECRET ?? 'e2e-throwaway-session-secret-at-least-32-chars',
          PAYROLL_FIELD_ENCRYPTION_KEY:
            process.env.PAYROLL_FIELD_ENCRYPTION_KEY ?? '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
        },
      },
})
