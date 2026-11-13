import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OutTodayCard as HomeOutTodayCard } from '../components/home/OutTodayCard'
import { OutTodayCard as TimeOffOutTodayCard } from '../components/leave/time-off/OutTodayCard'
import { othersOutToday, summariseOutToday, type HomeOverview, type OutPerson, type OutRow } from '../lib/home/out-today'
import { pickOutToday } from '../lib/time-off/api'

const row = (over: Partial<OutRow> & { employeeId: string }): OutRow => ({
  name: over.employeeId,
  department: 'Design',
  leaveType: 'CASUAL',
  isHalfDay: false,
  halfDaySession: null,
  status: 'APPROVED',
  ...over,
})

const person = (id: string, name: string, over: Partial<OutPerson> = {}): OutPerson => ({
  id,
  name,
  department: 'Design',
  leaveType: 'CASUAL',
  isHalfDay: false,
  halfDaySession: null,
  ...over,
})

const outToday = (people: OutPerson[]) => ({ count: people.length, people })

test('only approved leave counts as out today', () => {
  const { people } = summariseOutToday(
    [
      row({ employeeId: 'a', status: 'PENDING' }),
      row({ employeeId: 'b', status: 'LEAD_APPROVED' }),
      row({ employeeId: 'c', status: 'HR_APPROVED' }),
      row({ employeeId: 'd', status: 'APPROVED' }),
    ],
    { id: 'v', department: 'Design' }
  )
  assert.deepEqual(people.map((p) => p.id), ['d'])
})

test('a pending request does not hide or replace the approved one', () => {
  const { people, departmentOutToday } = summariseOutToday(
    [row({ employeeId: 'a', status: 'PENDING', isHalfDay: true }), row({ employeeId: 'a' })],
    { id: 'v', department: 'Design' }
  )
  assert.equal(people.length, 1)
  assert.equal(people[0].isHalfDay, false)
  assert.equal(departmentOutToday, 1)
})

test('othersOutToday leaves the viewer out of the count and the list', () => {
  const result = othersOutToday(outToday([person('a', 'Amy'), person('me', 'Me'), person('b', 'Ben')]), 'me')
  assert.equal(result.count, 2)
  assert.deepEqual(result.people.map((p) => p.id), ['a', 'b'])
})

test('othersOutToday with nobody else out', () => {
  assert.deepEqual(othersOutToday(outToday([person('me', 'Me')]), 'me'), { count: 0, people: [] })
})

function overview(people: OutPerson[]): HomeOverview {
  return {
    today: '2026-11-11',
    outToday: outToday(people),
    department: null,
    departmentOutToday: null,
    nextOutInDepartment: null,
    teamLabel: null,
    nextHoliday: null,
    upcomingHolidays: [],
  }
}

test('Home and Time off show the same count from the same data', () => {
  const people = [person('a', 'Amy Ray'), person('me', 'Me Myself'), person('b', 'Ben Cole', { isHalfDay: true, halfDaySession: 'FIRST_HALF', leaveType: 'ANNUAL' })]
  const home = renderToStaticMarkup(
    createElement(HomeOutTodayCard, { overview: { ok: true, data: overview(people) }, teamUpcoming: null, viewerId: 'me' })
  )
  const timeOff = renderToStaticMarkup(createElement(TimeOffOutTodayCard, { outToday: outToday(people), viewerId: 'me' }))
  assert.match(home, />2</)
  assert.match(timeOff, /aria-label="2 people out today"/)
  assert.doesNotMatch(timeOff, /Me Myself/)
  assert.match(timeOff, /Amy Ray/)
  assert.match(timeOff, /Ben Cole/)
  assert.match(timeOff, /\(Annual, First half\)/)
})

test('Time off card: nothing when only the viewer is out, or before it loads', () => {
  assert.equal(renderToStaticMarkup(createElement(TimeOffOutTodayCard, { outToday: outToday([person('me', 'Me')]), viewerId: 'me' })), '')
  assert.equal(renderToStaticMarkup(createElement(TimeOffOutTodayCard, { outToday: null, viewerId: 'me' })), '')
})

test('pickOutToday reads the overview body and rejects anything else', () => {
  const data = outToday([person('a', 'Amy')])
  assert.deepEqual(pickOutToday({ success: true, data: { outToday: data } }), data)
  assert.equal(pickOutToday({ success: true, data: {} }), null)
  assert.equal(pickOutToday({ success: true, data: { outToday: { count: 1 } } }), null)
  assert.equal(pickOutToday(null), null)
})

test('Time off out today does not come from the calendar month being viewed', () => {
  const page = readFileSync('app/(evaluator)/leave/page.tsx', 'utf8')
  const hook = readFileSync('components/leave/time-off/useTimeOffData.ts', 'utf8')
  const api = readFileSync('lib/time-off/api.ts', 'utf8')
  const grid = readFileSync('lib/time-off/calendar-grid.ts', 'utf8')
  assert.doesNotMatch(page, /outToday\(/)
  assert.doesNotMatch(grid, /export function outToday/)
  assert.match(page, /<OutTodayCard outToday=\{data\.outToday\} viewerId=/)
  assert.match(api, /'\/api\/home\/overview'/)
  // Loaded with the snapshot, never by the month fetch.
  const fetchCalendar = hook.slice(hook.indexOf('const fetchCalendar'), hook.indexOf('const reloadCalendar'))
  assert.doesNotMatch(fetchCalendar, /loadOutToday/)
  assert.match(hook.slice(hook.indexOf('const reload ='), hook.indexOf('const fetchCalendar')), /loadOutToday\(/)
})

test('the overview asks the database for approved leave only', () => {
  const source = readFileSync('lib/home/overview.ts', 'utf8')
  assert.match(source, /status: OUT_TODAY_STATUS/)
})
