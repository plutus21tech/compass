import test from 'node:test'
import assert from 'node:assert/strict'
import { applyEvent, moduleCardState, nextToUnlock, parseProgressState, type ProgressState } from '../lib/academy/progress'

const EMPTY: ProgressState = { checks: {}, linksOpenedAt: {}, scrolledToEnd: false }
const NOW = new Date('2026-12-05T00:00:00Z')
const PAST = new Date('2026-12-01T00:00:00Z')
const FUTURE = new Date('2026-12-09T00:00:00Z')

test('parseProgressState gives the empty state for junk and never throws', () => {
  assert.deepEqual(parseProgressState('junk'), EMPTY)
  assert.deepEqual(parseProgressState(null), EMPTY)
  assert.deepEqual(parseProgressState({ checks: 5 }), EMPTY)
})

test('parseProgressState keeps valid state', () => {
  const s = { checks: { a: true }, linksOpenedAt: { X: '2026-12-01T00:00:00.000Z' }, scrolledToEnd: true, linkedinUrl: 'https://l.in/x' }
  assert.deepEqual(parseProgressState(s), s)
})

test('applyEvent does not mutate and keeps the first open time', () => {
  const frozen = Object.freeze({ ...EMPTY })
  const once = applyEvent(frozen, { type: 'LINK_OPENED', key: 'K' }, new Date('2026-12-01T00:00:00Z'))
  const twice = applyEvent(once, { type: 'LINK_OPENED', key: 'K' }, new Date('2026-12-02T00:00:00Z'))
  assert.deepEqual(frozen, EMPTY)
  assert.equal(twice.linksOpenedAt.K, '2026-12-01T00:00:00.000Z')
  assert.notEqual(once, twice)
})

test('applyEvent handles CHECK and SCROLLED_END', () => {
  const s = applyEvent(applyEvent(EMPTY, { type: 'CHECK', key: 'c', checked: true }, NOW), { type: 'SCROLLED_END' }, NOW)
  assert.deepEqual(s.checks, { c: true })
  assert.equal(s.scrolledToEnd, true)
  assert.equal(applyEvent(s, { type: 'CHECK', key: 'c', checked: false }, NOW).checks.c, false)
})

test('moduleCardState statuses and overdue', () => {
  assert.deepEqual(moduleCardState({ status: 'LOCKED', startedAt: null, dueAt: PAST }, NOW), { status: 'LOCKED', overdue: true })
  assert.deepEqual(moduleCardState({ status: 'LOCKED', startedAt: null, dueAt: FUTURE }, NOW), { status: 'LOCKED', overdue: false })
  assert.deepEqual(moduleCardState({ status: 'IN_PROGRESS', startedAt: null, dueAt: FUTURE }, NOW), { status: 'AVAILABLE', overdue: false })
  assert.deepEqual(moduleCardState({ status: 'IN_PROGRESS', startedAt: PAST, dueAt: PAST }, NOW), { status: 'IN_PROGRESS', overdue: true })
  assert.deepEqual(moduleCardState({ status: 'COMPLETED', startedAt: PAST, dueAt: PAST }, NOW), { status: 'COMPLETED', overdue: false })
  assert.deepEqual(moduleCardState({ status: 'IN_PROGRESS', startedAt: PAST, dueAt: null }, NOW), { status: 'IN_PROGRESS', overdue: false })
})

test('nextToUnlock picks the next active module by orderIndex', () => {
  const mods = [
    { id: 'c', orderIndex: 3, isActive: true },
    { id: 'a', orderIndex: 1, isActive: true },
    { id: 'b', orderIndex: 2, isActive: false },
  ]
  assert.equal(nextToUnlock(mods, 'a'), 'c')
  assert.equal(nextToUnlock(mods, 'c'), null)
  assert.equal(nextToUnlock(mods, 'zzz'), null)
})
