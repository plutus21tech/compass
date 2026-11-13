import test from 'node:test'
import assert from 'node:assert/strict'
import type { Block } from '../lib/academy/blocks'
import { effectiveRule, evaluateCompletion, type CompletionInput } from '../lib/academy/completion'
import { mutationLimitFor } from '../lib/academy/rate-limits'
import { applyVideoProgress, parseProgressState, progressEventSchema, type ProgressState } from '../lib/academy/progress'

const T0 = new Date('2026-12-01T09:00:00.000Z')
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000)
const empty: ProgressState = { checks: {}, linksOpenedAt: {}, scrolledToEnd: false }
const DURATION = 600
/** A count of `furthest` reported at `t`, with the full tolerance left. */
const countAt = (furthest: number, t: number, durationSeconds = DURATION): ProgressState => ({
  ...empty, video: { furthest, reportedAt: at(t).toISOString(), durationSeconds },
})

test('posting 600 seconds right after the start gives at most 15', () => {
  const next = applyVideoProgress(empty, 600, T0, DURATION, T0)
  assert.equal(next.video?.furthest, 15)
  assert.equal(next.video?.durationSeconds, DURATION)
})

test('with no start time, the first report counts no elapsed time', () => {
  assert.equal(applyVideoProgress(empty, 600, T0, DURATION, null).video?.furthest, 15)
})

test('the first report counts elapsed time from the start', () => {
  assert.equal(applyVideoProgress(empty, 25, at(25), DURATION, T0).video?.furthest, 25)
})

test('the first report an hour after the start gains at most 48 seconds', () => {
  assert.equal(applyVideoProgress(empty, DURATION, at(3600), DURATION, T0).video?.furthest, 48)
})

test('a report an hour after the previous one gains at most 48 seconds', () => {
  const later = applyVideoProgress(countAt(100, 100), DURATION, at(3700), DURATION, T0)
  assert.equal(later.video?.furthest, 148)
})

test('a paused video resumes normally', () => {
  let state = countAt(60, 60)
  // Paused for ten minutes at 60, then playing again with reports every 10 seconds.
  for (let t = 670, position = 70; t <= 720; t += 10, position += 10) {
    state = applyVideoProgress(state, position, at(t), DURATION, T0)
    assert.equal(state.video?.furthest, position)
  }
})

test('honest reports every 10 seconds are never clipped and reach 95% at 95% of the duration', () => {
  let state = empty
  for (let t = 10; t <= DURATION; t += 10) {
    state = applyVideoProgress(state, t, at(t), DURATION, T0)
    assert.equal(state.video?.furthest, t)
  }
})

test('a client claiming the end every 10 seconds reaches 95% only after about 95% of the duration', () => {
  let state = empty
  let reachedAt: number | null = null
  for (let t = 10; t <= DURATION * 2 && reachedAt === null; t += 10) {
    state = applyVideoProgress(state, DURATION, at(t), DURATION, T0)
    if (state.video!.furthest >= 0.95 * DURATION) reachedAt = t
  }
  assert.ok(reachedAt !== null)
  // No faster than real time × 1.1 plus a single 15-second tolerance: the tolerance never compounds.
  assert.ok(reachedAt >= (0.95 * DURATION - 15) / 1.1, `reached at ${reachedAt}s`)
  assert.ok(reachedAt <= 0.95 * DURATION, `reached at ${reachedAt}s`)
})

test('a client reporting every second gains no more than one tolerance', () => {
  let state = empty
  for (let t = 1; t <= 100; t += 1) state = applyVideoProgress(state, DURATION, at(t), DURATION, T0)
  assert.ok(state.video!.furthest <= 100 * 1.1 + 15 + 1e-9, String(state.video!.furthest))
})

test('furthest never drops', () => {
  const rewound = applyVideoProgress(countAt(120, 120), 30, at(130), DURATION, T0)
  assert.equal(rewound.video?.furthest, 120)
})

test('furthest never passes the duration', () => {
  const late = applyVideoProgress(countAt(590, 100), 9999, at(5000), DURATION, T0)
  assert.equal(late.video?.furthest, DURATION)
})

test('a changed duration restarts from 0', () => {
  const half = countAt(300, 300)
  const restarted = applyVideoProgress(half, 300, at(310), 900, T0)
  assert.equal(restarted.video?.durationSeconds, 900)
  assert.equal(restarted.video?.furthest, 15)
})

test('the other progress is kept', () => {
  const state: ProgressState = { ...empty, scrolledToEnd: true, checks: { a: true } }
  const next = applyVideoProgress(state, 10, at(10), DURATION, T0)
  assert.equal(next.scrolledToEnd, true)
  assert.deepEqual(next.checks, { a: true })
  assert.equal(state.video, undefined)
})

test('the video state survives a round trip and a broken one is dropped alone', () => {
  const next = applyVideoProgress(empty, 10, at(10), DURATION, T0)
  assert.deepEqual(parseProgressState(JSON.parse(JSON.stringify(next))), next)
  const broken = parseProgressState({ ...empty, scrolledToEnd: true, video: { furthest: 'x' } })
  assert.equal(broken.scrolledToEnd, true)
  assert.equal(broken.video, undefined)
})

test('VIDEO_PROGRESS is a valid event only with a sane number of seconds', () => {
  assert.deepEqual(progressEventSchema.parse({ type: 'VIDEO_PROGRESS', seconds: 42.5 }), { type: 'VIDEO_PROGRESS', seconds: 42.5 })
  for (const seconds of [-1, Number.NaN, Number.POSITIVE_INFINITY, '10', 1e9]) {
    assert.equal(progressEventSchema.safeParse({ type: 'VIDEO_PROGRESS', seconds }).success, false, String(seconds))
  }
  assert.equal(progressEventSchema.safeParse({ type: 'VIDEO_PROGRESS', seconds: 1, furthest: 1 }).success, false)
})

const video: Block = { type: 'video', videoKey: 'VIDEO_1', summary: 'x' }
const FACTS = { tutorialCount: 0, dashboardLinkSet: false }

test('an unready video keeps the rule at SCROLL_END, and a ready one makes it VIDEO_95', () => {
  assert.equal(effectiveRule('VIDEO_95', [video], { ...FACTS, videoReady: false }), 'SCROLL_END')
  assert.equal(effectiveRule('VIDEO_95', [video], { ...FACTS, videoReady: true }), 'VIDEO_95')
  assert.equal(effectiveRule('VIDEO_95', [], { ...FACTS, videoReady: true }), 'SCROLL_END')
})

const base: CompletionInput = {
  rule: 'VIDEO_95',
  blocks: [video],
  state: empty,
  tutorialKeys: [],
  discordUsername: null,
  securityAckSigned: false,
  payment: { kind: 'PK', bankSaved: false },
  videoDurationSeconds: DURATION,
}
const watched = (furthest: number, durationSeconds = DURATION): ProgressState => ({
  ...empty, video: { furthest, durationSeconds, reportedAt: T0.toISOString() },
})

test('VIDEO_95 is met when furthest reaches 95% of the duration', () => {
  assert.deepEqual(evaluateCompletion({ ...base, state: watched(570) }), { met: true })
  assert.equal(evaluateCompletion({ ...base, state: watched(569) }).met, false)
  assert.equal(evaluateCompletion({ ...base, state: { ...empty, scrolledToEnd: true } }).met, false)
})

test('VIDEO_95 is not met by a furthest from a video of another duration', () => {
  assert.equal(evaluateCompletion({ ...base, state: watched(600, 300) }).met, false)
  assert.equal(evaluateCompletion({ ...base, state: watched(600), videoDurationSeconds: null }).met, false)
})

test('video reports have their own rate-limit bucket; every other event keeps the shared one', () => {
  assert.deepEqual(mutationLimitFor('u1', 'video'), { key: 'academy-video:u1', max: 400 })
  assert.deepEqual(mutationLimitFor('u1', 'default'), { key: 'academy:u1', max: 120 })
})
