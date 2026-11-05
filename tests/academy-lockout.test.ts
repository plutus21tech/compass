import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { NextRequest } from 'next/server'
import type { NavItem, SidebarConfig } from '../components/layout/AppSidebar'
import { withLockedHandbookNav } from '../components/layout/sidebar-nav'
import {
  ACADEMY_PATH_HEADER,
  blocksActionOnAnotherUser,
  isLockedUser,
  isPathAllowedWhileLocked,
  quizResetUserData,
  readLockoutPath,
  shouldBlockSession,
  shouldRedirectLockedPage,
} from '../lib/academy/lockout'
import { middleware } from '../middleware'

const FORWARDED = `x-middleware-request-${ACADEMY_PATH_HEADER}`

test('the header name is the agreed one', () => {
  assert.equal(ACADEMY_PATH_HEADER, 'x-compass-pathname')
})

test('allowlisted pages and APIs are allowed, including anything under a prefix', () => {
  for (const path of [
    '/onboarding',
    '/onboarding/welcome',
    '/onboarding/quiz',
    '/profile',
    '/handbook',
    '/handbook/leave-policy',
    '/login',
    '/api/auth/session',
    '/api/auth/logout',
    '/api/auth/login',
    '/api/auth/csrf',
    '/api/onboarding/academy/bank',
    '/api/onboarding/academy/modules/welcome/complete',
    '/api/onboarding/academy/modules/welcome/events',
    '/api/handbook',
    '/api/handbook/leave-policy',
    '/api/onboarding/payout',
    '/api/users/me',
    '/api/weekly/me',
    '/api/security-checks/me',
    '/api/clientele/access',
    '/api/office/avatar',
    '/api/projects/notification-preferences',
    '/api/admin/password',
  ]) {
    assert.equal(isPathAllowedWhileLocked(path), true, path)
  }
})

test('prefixes match a whole segment', () => {
  for (const path of [
    '/onboardingfoo',
    '/handbookish',
    '/profiles',
    '/loginx',
    '/api/authx/session',
    '/api/handbookish',
    '/api/onboarding/academyx/bank',
  ]) {
    assert.equal(isPathAllowedWhileLocked(path), false, path)
  }
})

test('exact entries do not cover anything beneath or beside them', () => {
  for (const path of [
    '/api/onboarding/payout/x',
    '/api/onboarding/payouts',
    '/api/users/me/x',
    '/api/users/mentions',
    '/api/users',
    '/api/users/other-id',
    '/api/weekly/me/x',
    '/api/security-checks/me/x',
    '/api/clientele/access/x',
    '/api/clientele',
    '/api/office/avatar/x',
    '/api/office/token',
    '/api/projects/notification-preferences/x',
    '/api/admin/password/x',
  ]) {
    assert.equal(isPathAllowedWhileLocked(path), false, path)
  }
})

test('the rest of the app is refused', () => {
  for (const path of ['/', '', '/dashboard', '/api/leave', '/api/admin/users', '/admin', '/admin/handbook', '/api/admin/handbook', '/onboarding-admin']) {
    assert.equal(isPathAllowedWhileLocked(path), false, path)
  }
})

test('a page path does not open the API of the same name, or the reverse', () => {
  assert.equal(isPathAllowedWhileLocked('/api/profile'), false)
  assert.equal(isPathAllowedWhileLocked('/api/onboarding'), false)
  assert.equal(isPathAllowedWhileLocked('/users/me'), false)
})

test('legacy onboarding routes are refused: a hire could otherwise finish the old way', () => {
  for (const path of [
    '/api/onboarding/progress',
    '/api/onboarding/quiz',
    '/api/onboarding/quiz/submit',
    '/api/onboarding/quiz/attempts',
    '/api/onboarding/modules',
    '/api/onboarding/modules/welcome',
    '/api/onboarding/config',
  ]) {
    assert.equal(isPathAllowedWhileLocked(path), false, path)
    assert.equal(shouldBlockSession({ enabled: true, onboardingCompleted: false, pathname: path }), true, path)
  }
})

test('under /api/onboarding only academy and payout are open, for every route on disk', () => {
  const root = join(process.cwd(), 'app', 'api', 'onboarding')
  const open: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === 'route.ts') {
        const path = `/api/onboarding/${relative(root, dir).split(sep).join('/')}`
        if (isPathAllowedWhileLocked(path)) open.push(path)
      }
    }
  }
  walk(root)
  assert.ok(open.length > 0)
  for (const path of open) {
    assert.ok(path === '/api/onboarding/payout' || path.startsWith('/api/onboarding/academy/'), path)
  }
})

test('shouldBlockSession: flag off never blocks', () => {
  for (const pathname of ['/api/leave', '/dashboard', null]) {
    assert.equal(shouldBlockSession({ enabled: false, onboardingCompleted: false, pathname }), false)
  }
})

test('shouldBlockSession: a completed user is never blocked (staff assigned one module included)', () => {
  for (const pathname of ['/api/leave', '/dashboard', null]) {
    assert.equal(shouldBlockSession({ enabled: true, onboardingCompleted: true, pathname }), false)
  }
})

test('shouldBlockSession: a locked user', () => {
  assert.equal(shouldBlockSession({ enabled: true, onboardingCompleted: false, pathname: '/api/leave' }), true)
  assert.equal(shouldBlockSession({ enabled: true, onboardingCompleted: false, pathname: null }), true)
  assert.equal(shouldBlockSession({ enabled: true, onboardingCompleted: false, pathname: '' }), true)
  assert.equal(shouldBlockSession({ enabled: true, onboardingCompleted: false, pathname: '/onboarding' }), false)
  assert.equal(shouldBlockSession({ enabled: true, onboardingCompleted: false, pathname: '/api/auth/logout' }), false)
})

test('blocksActionOnAnotherUser: a locked user can act only on their own account', () => {
  const locked = { enabled: true, onboardingCompleted: false, actorId: 'hire' }
  assert.equal(blocksActionOnAnotherUser({ ...locked, targetUserId: 'someone-else' }), true)
  assert.equal(blocksActionOnAnotherUser({ ...locked, targetUserId: 'hire' }), false)
})

test('blocksActionOnAnotherUser: a missing or malformed target is not treated as the user themselves', () => {
  const locked = { enabled: true, onboardingCompleted: false, actorId: 'hire' }
  for (const targetUserId of [undefined, null, '', ['hire'], { id: 'hire' }]) {
    assert.equal(blocksActionOnAnotherUser({ ...locked, targetUserId }), true)
  }
})

test('blocksActionOnAnotherUser: a completed user is unaffected', () => {
  assert.equal(blocksActionOnAnotherUser({ enabled: true, onboardingCompleted: true, actorId: 'hr', targetUserId: 'someone-else' }), false)
})

test('blocksActionOnAnotherUser: flag off changes nothing', () => {
  assert.equal(blocksActionOnAnotherUser({ enabled: false, onboardingCompleted: false, actorId: 'hr', targetUserId: 'someone-else' }), false)
})

test('isLockedUser: decides the password DELETE, which is refused for a locked user whatever the target', () => {
  assert.equal(isLockedUser({ enabled: true, onboardingCompleted: false }), true)
  assert.equal(isLockedUser({ enabled: true, onboardingCompleted: true }), false)
  assert.equal(isLockedUser({ enabled: false, onboardingCompleted: false }), false)
  assert.equal(isLockedUser({ enabled: false, onboardingCompleted: true }), false)
})

test('quizResetUserData: flag on leaves onboardingCompleted out, so a reset can never lock anyone', () => {
  assert.equal('onboardingCompleted' in quizResetUserData(true), false)
})

test('quizResetUserData: flag off keeps the legacy reset', () => {
  assert.deepEqual(quizResetUserData(false), { onboardingCompleted: false })
})

test('readLockoutPath returns the header, and null when it is absent or unreadable', async () => {
  const withHeader = async () => new Headers({ [ACADEMY_PATH_HEADER]: '/onboarding' })
  assert.equal(await readLockoutPath(withHeader), '/onboarding')
  assert.equal(await readLockoutPath(async () => new Headers()), null)
  const outsideARequest = (): Promise<Headers> => {
    throw new Error('headers was called outside a request scope')
  }
  assert.equal(await readLockoutPath(outsideARequest), null)
  assert.equal(await readLockoutPath(async () => Promise.reject(new Error('no store'))), null)
})

const request = (path: string, headers: Record<string, string> = {}): NextRequest =>
  new NextRequest(new URL(path, 'http://localhost:3000'), { headers })

test('middleware sets the path on signed-in requests, replacing a spoofed value', () => {
  const response = middleware(request('/api/leave', { cookie: 'pe_session=x', [ACADEMY_PATH_HEADER]: '/onboarding' }))
  assert.equal(response.headers.get('x-middleware-next'), '1')
  assert.equal(response.headers.get(FORWARDED), '/api/leave')
  assert.ok(response.headers.get('x-middleware-override-headers')?.includes(ACADEMY_PATH_HEADER))
})

test('middleware sets the path on the public branch too, replacing a spoofed value', () => {
  for (const path of ['/login', '/api/auth/login', '/api/leave/transition-plan-reminders', '/api/cron/weekly-evaluations', '/peer-requests/abc']) {
    const response = middleware(request(path, { [ACADEMY_PATH_HEADER]: '/onboarding' }))
    assert.equal(response.headers.get('x-middleware-next'), '1', path)
    assert.equal(response.headers.get(FORWARDED), path, path)
  }
})

test('middleware forwards the original request headers alongside the path', () => {
  const response = middleware(request('/dashboard', { cookie: 'pe_session=x', 'x-other': 'kept' }))
  assert.equal(response.headers.get('x-middleware-request-x-other'), 'kept')
  assert.equal(response.headers.get('x-middleware-request-cookie'), 'pe_session=x')
})

test('middleware still refuses requests with no session cookie', () => {
  const api = middleware(request('/api/leave'))
  assert.equal(api.status, 401)
  const page = middleware(request('/dashboard?tab=a'))
  assert.equal(page.status, 307)
  assert.equal(new URL(page.headers.get('location') ?? '').pathname, '/login')
})

test('the client redirect: flag off behaves as today', () => {
  assert.equal(shouldRedirectLockedPage('/onboarding', false), false)
  assert.equal(shouldRedirectLockedPage('/onboarding/welcome', false), false)
  assert.equal(shouldRedirectLockedPage('/profile', false), false)
  assert.equal(shouldRedirectLockedPage('/handbook', false), true)
  assert.equal(shouldRedirectLockedPage('/handbook/leave-policy', false), true)
  assert.equal(shouldRedirectLockedPage('/dashboard', false), true)
})

test('the client redirect: flag on allows the handbook, whole segment only', () => {
  assert.equal(shouldRedirectLockedPage('/handbook', true), false)
  assert.equal(shouldRedirectLockedPage('/handbook/leave-policy', true), false)
  assert.equal(shouldRedirectLockedPage('/handbookish', true), true)
  assert.equal(shouldRedirectLockedPage('/dashboard', true), true)
})

test('the client redirect: while the flag is unknown it waits on the handbook and nowhere else', () => {
  assert.equal(shouldRedirectLockedPage('/handbook/leave-policy', null), false)
  assert.equal(shouldRedirectLockedPage('/dashboard', null), true)
  assert.equal(shouldRedirectLockedPage('/onboarding', null), false)
})

const icon = (() => null) as unknown as NavItem['icon']
const onboardingSidebar: SidebarConfig = {
  items: [
    { label: 'Onboarding', href: '/onboarding', icon },
    { label: 'Profile', href: '/profile', icon },
  ],
  groups: [],
}

test('the onboarding sidebar gains Company Dashboard only when the flag is on', () => {
  assert.equal(withLockedHandbookNav(onboardingSidebar, false, icon), onboardingSidebar)
  const next = withLockedHandbookNav(onboardingSidebar, true, icon)
  assert.deepEqual(next.items.map((item) => [item.label, item.href]), [
    ['Onboarding', '/onboarding'],
    ['Company Dashboard', '/handbook'],
    ['Profile', '/profile'],
  ])
  assert.equal(onboardingSidebar.items.length, 2)
})
