import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { reduceRange, type RangeEvent, type RangeState } from '../lib/time-off/range-select'
import { reduceTap, TAP_SLOP_PX, type PendingTap, type TapEvent } from '../lib/time-off/touch-tap'

const sel = (key: string) => key >= '2026-11-12' && key <= '2026-11-30'
const d = (n: number) => `2026-11-${String(n).padStart(2, '0')}`

type TapInput =
  | { type: 'down'; pointerType: string; pointerId: number; key: string; x: number; y: number }
  | Exclude<TapEvent, { type: 'down' }>

/** Drives both reducers the way TeamCalendar does: the tap reducer first, then the range's own pointer events. */
function run(steps: Array<{ tap: TapInput; range?: RangeEvent }>, start: RangeState) {
  let state = start
  let pending: PendingTap | null = null
  let commit: { start: string; end: string } | null = null
  const apply = (e: RangeEvent) => {
    const r = reduceRange(state, e, sel)
    state = r.state
    if (r.commit) commit = r.commit
  }
  for (const step of steps) {
    const tapEvent: TapEvent = step.tap.type === 'down' ? { ...step.tap, phase: state.phase } : step.tap
    const t = reduceTap(pending, tapEvent)
    pending = t.pending
    if (t.down) apply({ type: 'down', key: t.down })
    if (step.range) apply(step.range)
  }
  return { state, commit, pending }
}

const picking: RangeState = { phase: 'picking-end', anchor: d(19) }
const touchDown = (key: string, x = 100, y = 100): TapInput => ({ type: 'down', pointerType: 'touch', pointerId: 7, key, x, y })

test('touch: tap, then a second tap commits the range on release', () => {
  const r = run([{ tap: touchDown(d(23)) }, { tap: { type: 'up', pointerId: 7 }, range: { type: 'up', key: d(23) } }], picking)
  assert.deepEqual(r.commit, { start: d(19), end: d(23) })
  assert.deepEqual(r.state, { phase: 'idle' })
})

test('touch: the second touch alone does not commit (it may be the start of a scroll)', () => {
  const r = run([{ tap: touchDown(d(23)) }], picking)
  assert.equal(r.commit, null)
  assert.deepEqual(r.state, picking)
})

test('touch: down then pointercancel (the browser took it for a scroll) does nothing', () => {
  const r = run([{ tap: touchDown(d(23)) }, { tap: { type: 'cancel', pointerId: 7 } }, { tap: { type: 'up', pointerId: 7 } }], picking)
  assert.equal(r.commit, null)
  assert.deepEqual(r.state, picking)
})

test('touch: moving beyond the slop before release is a scroll, not a tap', () => {
  const r = run([
    { tap: touchDown(d(23), 100, 100) },
    { tap: { type: 'move', pointerId: 7, x: 100, y: 100 + TAP_SLOP_PX + 1 } },
    { tap: { type: 'up', pointerId: 7 } },
  ], picking)
  assert.equal(r.commit, null)
  assert.deepEqual(r.state, picking)
})

test('touch: a small wobble is still a tap; an earlier day re-anchors', () => {
  const r = run([
    { tap: touchDown(d(15), 100, 100) },
    { tap: { type: 'move', pointerId: 7, x: 103, y: 102 } },
    { tap: { type: 'up', pointerId: 7 } },
  ], picking)
  assert.equal(r.commit, null)
  assert.deepEqual(r.state, { phase: 'picking-end', anchor: d(15) })
})

test('mouse is unchanged: the second press commits immediately', () => {
  const r = run([{ tap: { type: 'down', pointerType: 'mouse', pointerId: 1, key: d(23), x: 0, y: 0 } }], picking)
  assert.deepEqual(r.commit, { start: d(19), end: d(23) })
})

test('touch from idle still starts a drag on pointerdown', () => {
  const r = run([{ tap: touchDown(d(20)) }], { phase: 'idle' })
  assert.deepEqual(r.state, { phase: 'dragging', anchor: d(20), current: d(20) })
})

test('the calendar routes pointer events through the tap reducer', () => {
  const src = readFileSync(join(process.cwd(), 'components/leave/time-off/TeamCalendar.tsx'), 'utf8')
  assert.match(src, /reduceTap\(/)
  assert.match(src, /onPointerCancel=/)
  assert.match(src, /onPointerMove=/)
})
