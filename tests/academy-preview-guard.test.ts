import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { AcademyRequestError, PREVIEW_REFUSAL, blockRequest, previewSafeSubmit } from '../components/academy/api'

const realFetch = globalThis.fetch
let calls: Array<{ url: string; method: string | undefined }> = []

function stubFetch(): void {
  calls = []
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method })
    return new Response(JSON.stringify({ success: true, data: { ok: true } }), { status: 200 })
  }) as typeof fetch
}

afterEach(() => {
  globalThis.fetch = realFetch
})

test('in a preview, every write is refused before it reaches fetch', async () => {
  stubFetch()
  const request = blockRequest(true)
  for (const method of ['PUT', 'POST'] as const) {
    await assert.rejects(request('/api/onboarding/academy/bank', method, { iban: 'x' }), (error: unknown) => {
      assert.ok(error instanceof AcademyRequestError)
      assert.equal(error.message, PREVIEW_REFUSAL)
      return true
    })
  }
  assert.deepEqual(calls, [])
})

test('a preview may still read, and outside a preview writes go through', async () => {
  stubFetch()
  assert.deepEqual(await blockRequest(true)<{ ok: boolean }>('/api/onboarding/academy/bank', 'GET'), { ok: true })
  await blockRequest(false)('/api/onboarding/academy/discord', 'PUT', { discordUsername: 'x' })
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'PUT'])
})

test('a preview submit makes no request: the handler never runs and the browser submit is stopped', async () => {
  stubFetch()
  let ran = 0
  let prevented = 0
  const event = { preventDefault: () => { prevented += 1 } }
  const submit = async () => {
    ran += 1
    await blockRequest(true)('/api/onboarding/academy/linkedin', 'PUT', { linkedinUrl: 'x' })
  }
  previewSafeSubmit(true, submit)(event)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(ran, 0)
  assert.equal(prevented, 1)
  assert.deepEqual(calls, [])

  previewSafeSubmit(false, async () => { ran += 1 })(event)
  assert.equal(ran, 1)
})
