import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MyWorkPanel } from '../components/home/MyWorkPanel'
import { NeedsYouList } from '../components/home/NeedsYouList'
import { doneThisWeek, nextFridayKey, recentUpdates, weekStartKey } from '../lib/home/extras'
import type { HomeTask } from '../lib/home/my-work'

// Wed 11 Nov 2026; the week started Mon 9 Nov.
const TODAY = '2026-11-11'

test('the week starts on Monday, and the suggested due date is the coming Friday', () => {
  assert.equal(weekStartKey(TODAY), '2026-11-09')
  assert.equal(weekStartKey('2026-11-09'), '2026-11-09')
  assert.equal(weekStartKey('2026-11-15'), '2026-11-09')
  assert.equal(nextFridayKey(TODAY), '2026-11-13')
  assert.equal(nextFridayKey('2026-11-13'), '2026-11-13')
  assert.equal(nextFridayKey('2026-11-14'), '2026-11-20')
})

test('done this week: only things finished since Monday, newest first', () => {
  const done = doneThisWeek(
    {
      weekSubmittedAt: '2026-11-10T06:00:00.000Z',
      selfReviews: [
        { monthName: 'November', submittedAt: '2026-11-11T05:00:00.000Z' },
        { monthName: 'October', submittedAt: '2026-10-29T05:00:00.000Z' },
      ],
    },
    TODAY
  )
  assert.deepEqual(done.map((d) => [d.title, d.day]), [
    ['November self-evaluation', '2026-11-11'],
    ['This week’s evaluation questions', '2026-11-10'],
  ])
  assert.deepEqual(doneThisWeek({ weekSubmittedAt: '2026-11-06T06:00:00.000Z', selfReviews: [] }, TODAY), [])
  assert.deepEqual(doneThisWeek({ weekSubmittedAt: null, selfReviews: [] }, TODAY), [])
})

test('recent updates: other people’s changes to your tasks, newest first, yours left out', () => {
  const activity = (id: string, actorId: string | null, createdAt: string) => ({
    id, summary: `change ${id}`, createdAt, actor: actorId ? { id: actorId, name: actorId } : null,
  })
  const result = recentUpdates(
    [
      { taskId: 't1', activities: [activity('a', 'lead', '2026-11-10T06:00:00Z'), activity('b', 'me', '2026-11-11T06:00:00Z')] },
      { taskId: 't2', activities: [activity('c', 'lead', '2026-11-11T07:00:00Z'), activity('d', null, '2026-11-11T08:00:00Z'), activity('e', 'pm', '2026-11-01T06:00:00Z'), activity('f', 'pm', '2026-10-01T06:00:00Z')] },
    ],
    'me'
  )
  assert.deepEqual(result.shown.map((u) => u.id), ['c', 'a', 'e'])
  assert.equal(result.more, 1)
})

const needs = (props: Partial<Parameters<typeof NeedsYouList>[0]> = {}) =>
  renderToStaticMarkup(createElement(NeedsYouList, { data: { items: [], incomplete: false }, todayKey: TODAY, ...props }))

test('needs you: a footer with what was done this week', () => {
  const html = needs({ done: [{ key: 'weekly', title: 'This week’s evaluation questions', day: '2026-11-10' }] })
  assert.match(html, /Done this week: 1/)
  assert.match(html, /aria-expanded="false"[^>]*>Show</)
  const nothing = needs({ done: [] })
  assert.match(nothing, /Done this week: 0/)
  assert.doesNotMatch(nothing, />Show</)
  // Without the extras the card is as it was.
  assert.doesNotMatch(needs(), /Done this week/)
})

const task = (o: Partial<HomeTask> = {}): HomeTask => ({
  id: 't1', title: 'Brand identity', status: 'TODO', priority: 'MEDIUM', dueDate: null, project: { id: 'p1', name: 'Engine' }, ...o,
})

const work = (props: Partial<Parameters<typeof MyWorkPanel>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(MyWorkPanel, {
      tasks: { ok: true, data: [task(), task({ id: 't2', title: 'Client report', dueDate: '2026-11-20' })] },
      projects: { ok: true, data: [] },
      viewerId: 'me',
      todayKey: TODAY,
      onOpenTask: () => {},
      ...props,
    })
  )

test('my work: a task with no due date offers a one-click date; a dated task does not', () => {
  const html = work({ onSetDue: () => {} })
  assert.equal(html.match(/>Set Fri 13 Nov</g)?.length, 1)
  assert.match(html, /aria-label="Set Brand identity due Fri 13 Nov"/)
  assert.doesNotMatch(work(), />Set Fri 13 Nov</)
})

test('my work: recent updates, a quiet month, and a footer when there are more', () => {
  const updates = { shown: [{ id: 'a', taskId: 't1', summary: 'Shiza Example moved your task to To do', createdAt: '2026-11-10T06:00:00Z' }], more: 2 }
  const html = work({ updates })
  assert.match(html, /Recent updates/)
  assert.match(html, /Shiza Example moved your task to To do/)
  assert.match(html, /Tue 10 Nov/)
  assert.match(html, /2 more updates/)
  assert.match(html, /href="\/my-tasks"[^>]*>See all</)
  const quiet = work({ updates: { shown: [], more: 0 } })
  assert.match(quiet, /No updates this month\./)
  assert.doesNotMatch(quiet, /See all/)
  assert.doesNotMatch(work(), /Recent updates/)
})
