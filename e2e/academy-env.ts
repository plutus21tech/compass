import { isWeeklyTestDatabase } from '../tests/helpers/weekly-test-db'

export const E2E_PORT = 3459
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`

/** Why the Academy E2E run must not start, or null when it may. Same database guard as the integration tests. */
export function academyE2eSkipReason(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!isWeeklyTestDatabase(env.DATABASE_URL)) {
    return 'Set DATABASE_URL to the local compass_weekly_test database (localhost, /compass_weekly_test). Any other database is refused.'
  }
  return null
}
