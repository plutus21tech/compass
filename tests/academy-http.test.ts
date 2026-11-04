import test from 'node:test'
import assert from 'node:assert/strict'
import { ZodError, z } from 'zod'

process.env.SESSION_SECRET ??= 'test-session-secret-test-session-secret'
const loadHttp = () => import('../lib/academy/http')

test('AcademyError maps to its own status', async () => {
  const { AcademyError, academyErrorResponse } = await loadHttp()
  const response = academyErrorResponse(new AcademyError('Nope', 403))
  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { success: false, error: 'Nope' })
})

test('ZodError maps to 400 with path and message', async () => {
  const { academyErrorResponse } = await loadHttp()
  const parsed = z.object({ a: z.string() }).safeParse({})
  assert.ok(!parsed.success && parsed.error instanceof ZodError)
  const response = academyErrorResponse(parsed.error)
  assert.equal(response.status, 400)
  assert.match((await response.json()).error, /^a: /)
})

test('anything else maps to 500 without leaking the message', async (t) => {
  const { academyErrorResponse } = await loadHttp()
  t.mock.method(console, 'error', () => {})
  const response = academyErrorResponse(new Error('db password is hunter2'))
  assert.equal(response.status, 500)
  assert.doesNotMatch(JSON.stringify(await response.json()), /hunter2/)
})

test('requireAcademySession is a 404 while the flag is off', async () => {
  const { AcademyError, requireAcademySession } = await loadHttp()
  const saved = process.env.ONBOARDING_ACADEMY_ENABLED
  delete process.env.ONBOARDING_ACADEMY_ENABLED
  try {
    await assert.rejects(requireAcademySession(), (e: unknown) => e instanceof AcademyError && e.status === 404)
  } finally {
    if (saved !== undefined) process.env.ONBOARDING_ACADEMY_ENABLED = saved
  }
})

test('a cross-origin rejection maps to 403 and bad JSON to 400', async () => {
  const { academyErrorResponse } = await loadHttp()
  const { SameOriginError } = await import('../lib/security/same-origin')
  assert.equal(academyErrorResponse(new SameOriginError('Cross-origin request rejected')).status, 403)
  assert.equal(academyErrorResponse(new SyntaxError('bad')).status, 400)
})
