// No server-only imports here: middleware and the client layout both load this file.

/** Set by middleware on every request, so a value sent by the client never survives. */
export const ACADEMY_PATH_HEADER = 'x-compass-pathname'

const ALLOWED_PREFIXES: readonly string[] = [
  '/onboarding',
  '/profile',
  '/handbook',
  '/login',
  '/api/auth',
  '/api/onboarding/academy',
  '/api/handbook',
]

// Legacy /api/onboarding/quiz, /progress and /modules stay out: a hire could finish onboarding through them.
const ALLOWED_EXACT: readonly string[] = [
  '/api/onboarding/payout',
  '/api/users/me',
  '/api/weekly/me',
  '/api/security-checks/me',
  '/api/clientele/access',
  '/api/office/avatar',
  '/api/projects/notification-preferences',
  '/api/admin/password',
]

function isUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function isPathAllowedWhileLocked(pathname: string): boolean {
  return ALLOWED_EXACT.includes(pathname) || ALLOWED_PREFIXES.some((prefix) => isUnder(pathname, prefix))
}

export interface SessionBlockInput {
  enabled: boolean
  onboardingCompleted: boolean
  pathname: string | null
}

/** Only a hire still in onboarding can be blocked. An unknown path fails closed for them. */
export function shouldBlockSession({ enabled, onboardingCompleted, pathname }: SessionBlockInput): boolean {
  if (!enabled || onboardingCompleted) return false
  return pathname === null || !isPathAllowedWhileLocked(pathname)
}

export interface AnotherUserActionInput {
  enabled: boolean
  onboardingCompleted: boolean
  actorId: string
  /** Unvalidated: it comes straight from the request. */
  targetUserId: unknown
}

/** For allowlisted routes that can also touch other accounts: a hire still in onboarding keeps to their own. */
export function blocksActionOnAnotherUser({ enabled, onboardingCompleted, actorId, targetUserId }: AnotherUserActionInput): boolean {
  if (!enabled || onboardingCompleted) return false
  return targetUserId !== actorId
}

/** Takes next/headers' `headers` as an argument so this file stays free of server imports. */
export async function readLockoutPath(readHeaders: () => Promise<Pick<Headers, 'get'>>): Promise<string | null> {
  try {
    return (await readHeaders()).get(ACADEMY_PATH_HEADER)
  } catch (error) {
    console.warn('[academy] could not read the request path; treating it as unknown', error)
    return null
  }
}

/**
 * The client redirect for a locked user, for pages. `academyEnabled` is null until the layout
 * has heard from the server: the handbook waits for that, or a hire would bounce off it.
 */
export function shouldRedirectLockedPage(pathname: string, academyEnabled: boolean | null): boolean {
  if (pathname.startsWith('/onboarding') || pathname.startsWith('/profile')) return false
  return !(isUnder(pathname, '/handbook') && academyEnabled !== false)
}
