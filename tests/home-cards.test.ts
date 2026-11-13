import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OutTodayCard } from '../components/home/OutTodayCard'
import { TimeOffCard } from '../components/home/TimeOffCard'
import { HolidayCard } from '../components/home/HolidayCard'
import type { HomeOverview, OutPerson } from '../lib/home/out-today'
import type { Source } from '../components/home/fetch-source'

const person = (id: string, name: string): OutPerson => ({
  id,
  name,
  department: 'Design',
  leaveType: 'CASUAL',
  isHalfDay: false,
  halfDaySession: null,
})

const people = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => person(id, `Person ${id}`))

function overview(patch: Partial<HomeOverview> = {}): Source<HomeOverview> {
  return {
    ok: true,
    data: {
      today: '2026-11-11',
      outToday: { count: people.length, people },
      department: 'Design',
      departmentOutToday: 0,
      nextOutInDepartment: { name: 'Mina Rao', startDate: '2026-11-26' },
      teamLabel: 'Pakistan team',
      nextHoliday: { date: '2026-12-25', name: 'Quaid-e-Azam Day', daysAway: 44 },
      upcomingHolidays: [{ date: '2026-12-25', name: 'Quaid-e-Azam Day', daysAway: 44 }],
      ...patch,
    },
  }
}

const out = (o: Source<HomeOverview> | null, viewerId = 'me') =>
  renderToStaticMarkup(createElement(OutTodayCard, { overview: o, teamUpcoming: null, viewerId }))

const FAILED = { ok: false, status: 500 } as const

test('out today: count, department sentence and next out', () => {
  const html = out(overview())
  assert.match(html, />6</)
  assert.match(html, /people out/)
  assert.match(html, /Everyone in Design is in today\./)
  assert.match(html, /Mina is next out on Thu 26 Nov\./)
  assert.match(html, /href="\/leave"/)
  assert.match(html, /See who/)
})

test('out today: nobody out', () => {
  const html = out(overview({ outToday: { count: 0, people: [] } }))
  assert.match(html, /Nobody is out today\./)
})

test('out today: the viewer is not counted or listed', () => {
  const html = out(overview(), 'a')
  assert.match(html, />5</)
  assert.doesNotMatch(html, /Person a/)
  const alone = out(overview({ outToday: { count: 1, people: [person('me', 'Me Myself')] } }))
  assert.match(alone, /Nobody is out today\./)
  assert.doesNotMatch(alone, /Me Myself/)
})

test('time off: request leave opens the Time off request panel', () => {
  const balance: Source<never> = {
    ok: true,
    data: { casualDays: 5, casualUsed: 0, annualDays: 14, annualUsed: 0, sickDays: 6, sickUsed: 6 },
  } as never
  const html = renderToStaticMarkup(createElement(TimeOffCard, { balance, ownLeave: { ok: true, data: [] }, todayKey: '2026-11-11' }))
  assert.match(html, /href="\/leave\?request=1"/)
  assert.match(html, /href="\/leave#my-requests"/)
  assert.match(html, />19</)
  assert.match(html, /5 casual/)
  assert.match(html, /No sick left/)
  assert.match(html, /No leave booked yet/)
})

test('holiday: date, days away and team chip', () => {
  const html = renderToStaticMarkup(createElement(HolidayCard, { overview: overview() }))
  assert.match(html, /Fri 25 Dec/)
  assert.match(html, /In 44 days/)
  assert.match(html, /Pakistan team/)
  assert.match(html, /All holidays/)
})

test('holiday: no team set', () => {
  const html = renderToStaticMarkup(createElement(HolidayCard, { overview: overview({ teamLabel: null, nextHoliday: null }) }))
  assert.match(html, /No team is set on your profile/)
  assert.doesNotMatch(html, /All holidays/)
})

test('holiday: none upcoming', () => {
  const html = renderToStaticMarkup(createElement(HolidayCard, { overview: overview({ nextHoliday: null, upcomingHolidays: [] }) }))
  assert.match(html, /No upcoming holidays for your team yet\./)
})

test('a failed source shows its own line', () => {
  const html = [
    out(FAILED),
    renderToStaticMarkup(createElement(TimeOffCard, { balance: FAILED, ownLeave: FAILED, todayKey: '2026-11-11' })),
    renderToStaticMarkup(createElement(HolidayCard, { overview: FAILED })),
  ]
  assert.match(html[0], /Could not load who is out today\./)
  assert.match(html[1], /Could not load your balance\./)
  assert.match(html[1], /href="\/leave\?request=1"/)
  assert.match(html[2], /Could not load holidays\./)
  for (const h of html) assert.doesNotMatch(h, /undefined|NaN/)
})

const row = (id: string, emp: string) => ({
  id,
  leaveType: 'CASUAL' as const,
  status: 'APPROVED',
  startDate: '2026-11-20',
  endDate: '2026-11-21',
  employee: { id: emp, name: `E ${emp}`, department: 'Design' },
})
const upcoming = (rows: ReturnType<typeof row>[]) =>
  renderToStaticMarkup(createElement(OutTodayCard, { overview: overview(), teamUpcoming: { ok: true, data: rows }, viewerId: 'me' }))

test('out today: team upcoming counts people, not rows', () => {
  assert.match(upcoming([row('1', 'x'), row('2', 'x')]), /1 person on your team has leave coming up/)
  assert.match(upcoming([row('1', 'x'), row('2', 'y'), row('3', 'z')]), /3 people on your team have leave coming up/)
})

test('time off: no false footer while own leave is loading; parts use separators', () => {
  const balance = {
    ok: true,
    data: { casualDays: 5, casualUsed: 0, annualDays: 14, annualUsed: 0, sickDays: 6, sickUsed: 6 },
  } as never
  const html = renderToStaticMarkup(createElement(TimeOffCard, { balance, ownLeave: null, todayKey: '2026-11-11' }))
  assert.doesNotMatch(html, /No leave booked yet/)
  assert.match(html, /aria-label="Loading"/)
  assert.match(html, /aria-label="5 casual · 14 annual · No sick left"/)
  assert.match(html, />19<\/span>/)
})
