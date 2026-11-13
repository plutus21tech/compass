import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// A source check: the lockout only works if getSession consults it and the middleware feeds it the path.
// The pure rules are tested in academy-lockout.test.ts; these tests fail if the wiring is taken out.
const read = (file: string) => readFileSync(join(__dirname, '..', file), 'utf8')

/** The text of one top-level function, up to the next top-level declaration. */
function bodyOf(source: string, signature: string): string {
  const start = source.indexOf(signature)
  assert.notEqual(start, -1, `${signature} not found`)
  const rest = source.slice(start + signature.length)
  const end = rest.search(/\n(?:export )?(?:async )?function |\nexport const /)
  return end === -1 ? rest : rest.slice(0, end)
}

test('getSession returns null for a locked hire, by calling isLockedOut after the session checks', () => {
  const body = bodyOf(read('lib/auth.ts'), 'export async function getSession()')
  assert.match(body, /if \(await isLockedOut\(user\.onboardingCompleted\)\) \{\s*return null\s*\}/)
  assert.ok(body.indexOf('isLockedOut(') > body.indexOf('passwordVersion !== session.passwordVersion'), 'lockout check comes after the session is validated')
})

test('isLockedOut reads the forwarded path and applies shouldBlockSession', () => {
  const body = bodyOf(read('lib/auth.ts'), 'async function isLockedOut(')
  assert.match(body, /readLockoutPath\(headers\)/)
  assert.match(body, /shouldBlockSession\(/)
})

test('the middleware sets the path header on every request it lets through', () => {
  const source = read('middleware.ts')
  assert.match(source, /headers\.set\(ACADEMY_PATH_HEADER, request\.nextUrl\.pathname\)/)
  assert.match(source, /NextResponse\.next\(\{ request: \{ headers \} \}\)/)
  // Both pass-through returns go via the helper; a bare NextResponse.next() would skip the header.
  assert.equal((source.match(/NextResponse\.next\(/g) ?? []).length, 1)
  assert.equal((source.match(/return nextWithPathname\(request\)/g) ?? []).length, 2)
})

test('the quiz reset only clears attempts, so it can never lock anyone out', () => {
  const source = read('app/api/admin/onboarding/quiz-attempts/reset/route.ts')
  assert.match(source, /await clearQuizAttempts\(prisma, userId\)/)
  assert.doesNotMatch(source, /onboardingCompleted:/)
  assert.doesNotMatch(source, /prisma\.\$transaction/)
})

test('the legacy progress route is gone, so an assigned module keeps its rule and signature', () => {
  assert.equal(existsSync(join(__dirname, '..', 'app/api/onboarding/progress/route.ts')), false)
})

test('only a course row tells OA that payment setup is done', () => {
  const source = read('app/api/onboarding/academy/modules/[slug]/complete/route.ts')
  assert.match(source, /slug === BANK_MODULE_SLUG && data\.nextSlug/)
})
