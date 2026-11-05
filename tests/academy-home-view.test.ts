import test from 'node:test'
import assert from 'node:assert/strict'
import type { ModuleCardView } from '../lib/academy/view'
import { callTimeLabel, moduleCardCopy } from '../lib/academy/view-labels'

function card(over: Partial<ModuleCardView> = {}): ModuleCardView {
  return {
    slug: 'discord',
    title: 'Discord',
    number: 4,
    phase: 'DAY_1',
    estimatedMinutes: 15,
    icon: null,
    status: 'AVAILABLE',
    overdue: false,
    dueAt: null,
    completedAt: null,
    ...over,
  }
}

test('moduleCardCopy: each state reads in the spec\'s words', () => {
  assert.deepEqual(moduleCardCopy(card({ number: 4, status: 'LOCKED' })), { label: 'Complete Module 3 first', chip: null })
  assert.deepEqual(moduleCardCopy(card({ status: 'AVAILABLE' })), { label: 'Start', chip: null })
  assert.deepEqual(moduleCardCopy(card({ status: 'IN_PROGRESS' })), { label: 'Continue', chip: null })
  assert.deepEqual(
    moduleCardCopy(card({ status: 'COMPLETED', completedAt: '2026-12-04T09:00:00Z' })),
    { label: 'Completed 4 Dec 2026', chip: null },
  )
})

test('moduleCardCopy: overdue adds the chip on any unfinished state', () => {
  for (const status of ['LOCKED', 'AVAILABLE', 'IN_PROGRESS'] as const) {
    assert.equal(moduleCardCopy(card({ status, overdue: true })).chip, 'Overdue', status)
  }
})

test('moduleCardCopy: a completed card never shows Overdue', () => {
  const done = card({ status: 'COMPLETED', overdue: true, completedAt: '2026-12-04T09:00:00Z' })
  assert.equal(moduleCardCopy(done).chip, null)
})

test('moduleCardCopy: the date follows the time zone it is given', () => {
  const done = card({ status: 'COMPLETED', completedAt: '2026-12-03T22:00:00Z' })
  assert.equal(moduleCardCopy(done).label, 'Completed 3 Dec 2026')
  assert.equal(moduleCardCopy(done, 'Asia/Karachi').label, 'Completed 4 Dec 2026')
})

test('callTimeLabel: a missing time reads "Time to be confirmed"', () => {
  assert.equal(callTimeLabel(null, 'UTC'), 'Time to be confirmed')
})

test('callTimeLabel: a time is in the hire own zone, or marked UTC when the zone is unknown', () => {
  assert.match(callTimeLabel('2026-11-25T09:00:00Z', 'Asia/Karachi'), /25 Nov, 2:00 pm$/)
  assert.match(callTimeLabel('2026-11-25T09:00:00Z', null), /25 Nov, 9:00 am UTC$/)
})
