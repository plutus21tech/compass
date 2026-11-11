import test from 'node:test'
import assert from 'node:assert/strict'
import { reduceRange, previewRange, type RangeState, type RangeEvent } from '../lib/time-off/range-select'

const sel = (key: string) => key >= '2026-11-12' && key <= '2026-11-30'
const d = (n: number) => `2026-11-${String(n).padStart(2, '0')}`
function run(events: RangeEvent[], start: RangeState = { phase: 'idle' }) {
  let state = start
  let commit: { start: string; end: string } | null = null
  for (const e of events) {
    const r = reduceRange(state, e, sel)
    state = r.state
    if (r.commit) commit = r.commit
  }
  return { state, commit }
}

test('a click then a later click commits the range', () => {
  const r = run([{ type: 'down', key: d(19) }, { type: 'up', key: d(19) }])
  assert.deepEqual(r.state, { phase: 'picking-end', anchor: d(19) }); assert.equal(r.commit, null)
  const r2 = run([{ type: 'down', key: d(23) }], r.state)
  assert.deepEqual(r2.commit, { start: d(19), end: d(23) }); assert.deepEqual(r2.state, { phase: 'idle' })
})

test('a click then an earlier click restarts from the earlier day', () => {
  const r = run([{ type: 'down', key: d(15) }], { phase: 'picking-end', anchor: d(19) })
  assert.deepEqual(r.state, { phase: 'picking-end', anchor: d(15) }); assert.equal(r.commit, null)
})

test('dragging forwards commits on release', () => {
  const r = run([{ type: 'down', key: d(19) }, { type: 'enter', key: d(21) }, { type: 'up', key: d(21) }])
  assert.deepEqual(r.commit, { start: d(19), end: d(21) }); assert.deepEqual(r.state, { phase: 'idle' })
})

test('dragging backwards orders the range', () => {
  const r = run([{ type: 'down', key: d(23) }, { type: 'enter', key: d(19) }, { type: 'up', key: d(19) }])
  assert.deepEqual(r.commit, { start: d(19), end: d(23) })
})

test('entering an unselectable day keeps the last good day', () => {
  const r = run([{ type: 'down', key: d(14) }, { type: 'enter', key: d(15) }, { type: 'enter', key: d(10) }])
  assert.deepEqual(r.state, { phase: 'dragging', anchor: d(14), current: d(15) })
})

test('pressing on a past day does nothing', () => {
  assert.deepEqual(run([{ type: 'down', key: d(10) }]).state, { phase: 'idle' })
  const r2 = run([{ type: 'down', key: d(10) }], { phase: 'picking-end', anchor: d(19) })
  assert.deepEqual(r2.state, { phase: 'picking-end', anchor: d(19) }); assert.equal(r2.commit, null)
})

test('cancel clears; up when idle does nothing', () => {
  assert.deepEqual(run([{ type: 'down', key: d(19) }, { type: 'cancel' }]).state, { phase: 'idle' })
  assert.deepEqual(run([{ type: 'up', key: d(19) }]), { state: { phase: 'idle' }, commit: null })
})

test('previewRange orders a backwards drag', () => {
  assert.deepEqual(previewRange({ phase: 'dragging', anchor: d(23), current: d(19) }), { start: d(19), end: d(23) })
  assert.deepEqual(previewRange({ phase: 'picking-end', anchor: d(19) }), { start: d(19), end: d(19) })
  assert.equal(previewRange({ phase: 'idle' }), null)
})
