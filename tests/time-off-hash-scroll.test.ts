import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scrollToHashOnce } from '../components/leave/time-off/use-scroll-to-hash'

const fakeDoc = (found: boolean) => {
  const calls: string[] = []
  const el = { scrollIntoView: () => calls.push('scrolled') }
  return { calls, doc: { getElementById: (id: string) => (found && id === 'my-requests' ? el : null) } }
}

test('/leave#my-requests scrolls to My requests once the first load is done', () => {
  const { calls, doc } = fakeDoc(true)
  assert.equal(scrollToHashOnce('#my-requests', 'my-requests', doc), true)
  assert.deepEqual(calls, ['scrolled'])
})

test('another hash, or a missing section, does nothing', () => {
  const { calls, doc } = fakeDoc(true)
  assert.equal(scrollToHashOnce('#other', 'my-requests', doc), false)
  const missing = fakeDoc(false)
  assert.equal(scrollToHashOnce('#my-requests', 'my-requests', missing.doc), false)
  assert.deepEqual([...calls, ...missing.calls], [])
})

test('the time off page scrolls to #my-requests after loading', () => {
  const page = readFileSync(join(process.cwd(), 'app/(evaluator)/leave/page.tsx'), 'utf8')
  assert.match(page, /useScrollToHash\('my-requests', !loading\)/)
})
