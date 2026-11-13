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
  onboardingCompleted: boolean
  pathname: string | null
}

/** Only a hire still in onboarding is ever locked (D2). */
export function isLockedUser({ onboardingCompleted }: { onboardingCompleted: boolean }): boolean {
  return !onboardingCompleted
}

/** An unknown path fails closed for a locked user. */
export function shouldBlockSession({ onboardingCompleted, pathname }: SessionBlockInput): boolean {
  if (!isLockedUser({ onboardingCompleted })) return false
  return pathname === null || !isPathAllowedWhileLocked(pathname)
}

export interface AnotherUserActionInput {
  onboardingCompleted: boolean
  actorId: string
  /** Unvalidated: it comes straight from the request. */
  targetUserId: unknown
}

/** For allowlisted routes that can also touch other accounts: a hire still in onboarding keeps to their own. */
export function blocksActionOnAnotherUser({ onboardingCompleted, actorId, targetUserId }: AnotherUserActionInput): boolean {
  return isLockedUser({ onboardingCompleted }) && targetUserId !== actorId
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

/** The client redirect for a locked user, for pages: the course, the profile and the Company Dashboard stay open. */
export function shouldRedirectLockedPage(pathname: string): boolean {
  if (pathname.startsWith('/onboarding') || pathname.startsWith('/profile')) return false
  return !isUnder(pathname, '/handbook')
}
