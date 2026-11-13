import test from 'node:test'
import assert from 'node:assert/strict'
import type { ModuleCardView, ReleasedHomeView } from '../lib/academy/view'
import { callTimeLabel, homeNextStep, homePanel, moduleCardCopy } from '../lib/academy/view-labels'

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

const released = (over: Partial<ReleasedHomeView> = {}): ReleasedHomeView => ({
  released: true,
  greeting: 'WELCOME TO THE TEAM, Cara',
  title: 'Analyst',
  department: 'Research',
  doneCount: 0,
  total: 14,
  courseDueAt: null,
  quiz: { status: 'LOCKED', dueAt: null, overdue: false, retakeAt: null, failedCount: 0 },
  nextModule: card({ status: 'AVAILABLE' }),
  yourCalls: { hrCallAt: null, teamCallAt: null, securityCallAt: null, blockersCall: 'WED 07:00', timeZone: null },
  yourBuddy: null,
  phases: [],
  ...over,
})

test('homeNextStep: nothing started and mid-course both point at the next module', () => {
  assert.equal(homeNextStep(released()), 'next')
  assert.equal(homeNextStep(released({ doneCount: 6, nextModule: card({ status: 'IN_PROGRESS' }) })), 'next')
})

test('homeNextStep: all 14 done', () => {
  assert.equal(homeNextStep(released({ doneCount: 14, nextModule: null })), 'all-done')
})

test('homeNextStep: nothing open but not finished', () => {
  assert.equal(homeNextStep(released({ doneCount: 6, nextModule: null })), 'waiting-next')
  assert.equal(homeNextStep(released({ doneCount: 0, total: 0, nextModule: null })), 'waiting-next')
})

test('homePanel: released, waiting hire and existing employee', () => {
  assert.equal(homePanel({ released: false }, true), 'waiting')
  assert.equal(homePanel({ released: false }, false), 'nothing-to-do')
  assert.equal(homePanel(released(), true), 'home')
  assert.equal(homePanel(released(), false), 'home')
})
