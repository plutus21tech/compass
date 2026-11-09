import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { eventBucket } from '../lib/academy/rate-limits'
import { TRANSCRIPT_HEADERS, TRANSCRIPT_ERROR_HEADERS } from '../lib/academy/video'

const read = (file: string) => readFileSync(join(__dirname, '..', file), 'utf8')

test('eventBucket: only a video report goes to the video bucket; anything else, broken or not, to default', () => {
  assert.equal(eventBucket({ type: 'VIDEO_PROGRESS', seconds: 10 }), 'video')
  assert.equal(eventBucket({ type: 'SCROLLED_END' }), 'default')
  assert.equal(eventBucket({ type: 'CHECK', key: 'a', checked: true }), 'default')
  for (const junk of [undefined, null, 'VIDEO_PROGRESS', 42, [], { type: 7 }, {}]) assert.equal(eventBucket(junk), 'default', String(junk))
})

test('the events route checks the origin before reading the body, and rate-limits bad bodies too', () => {
  const source = read('app/api/onboarding/academy/modules/[slug]/events/route.ts')
  const origin = source.indexOf('assertSameOrigin(')
  const body = source.indexOf('request.json()')
  const guard = source.indexOf('guardAcademyMutation(')
  const parse = source.indexOf('progressEventSchema.parse(')
  assert.ok(origin >= 0 && body >= 0 && guard >= 0 && parse >= 0)
  assert.ok(origin < body, 'same-origin before the body is read')
  assert.ok(guard < parse, 'the rate limit counts a body before it is validated')
  assert.match(source, /eventBucket\(/)
})

test('transcripts are plain text, never cached or sniffed, and errors are not cached either', () => {
  assert.deepEqual(TRANSCRIPT_HEADERS, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  assert.deepEqual(TRANSCRIPT_ERROR_HEADERS, { 'Cache-Control': 'no-store' })
  const source = read('app/api/onboarding/academy/videos/[key]/transcript/route.ts')
  assert.match(source, /headers: TRANSCRIPT_HEADERS/)
  assert.match(source, /TRANSCRIPT_ERROR_HEADERS/)
})
