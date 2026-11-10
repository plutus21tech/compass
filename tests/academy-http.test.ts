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

test('a cross-origin rejection maps to 403 and bad JSON to 400', async () => {
  const { academyErrorResponse } = await loadHttp()
  const { SameOriginError } = await import('../lib/security/same-origin')
  assert.equal(academyErrorResponse(new SameOriginError('Cross-origin request rejected')).status, 403)
  assert.equal(academyErrorResponse(new SyntaxError('bad')).status, 400)
})

test('readBoundedJson parses a small body, refuses a large one with 413, and bad JSON with a SyntaxError', async () => {
  const { AcademyError, readBoundedJson } = await loadHttp()
  const body = (text: string, headers: Record<string, string> = {}) => new Request('https://compass.example/x', { method: 'POST', body: text, headers })
  assert.deepEqual(await readBoundedJson(body('{"source":"draft"}'), 100), { source: 'draft' })
  await assert.rejects(readBoundedJson(body('x'.repeat(101)), 100), (e: unknown) => e instanceof AcademyError && e.status === 413)
  // A declared length over the cap is refused before the body is read.
  await assert.rejects(readBoundedJson(body('{}', { 'content-length': '5000' }), 100), (e: unknown) => e instanceof AcademyError && e.status === 413)
  await assert.rejects(readBoundedJson(body('{nope'), 100), SyntaxError)
})
