import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DayDetails, isWeekendKey } from '@/components/leave/time-off/DayDetails'
import { DayPeopleList } from '@/components/leave/time-off/DayPeopleList'
import { MyRequests } from '@/components/leave/time-off/MyRequests'
import { SidePanel } from '@/components/leave/time-off/SidePanel'
import { TeamCalendar } from '@/components/leave/time-off/TeamCalendar'
import { approvalTracker, isWaiting, returnDateKey, sortByReturn, splitRequests } from '@/lib/time-off/day-details'
import type { CalendarEvent, LeaveRequest } from '@/lib/time-off/types'

const noop = () => {}

/** Fictional people only. */
function event(o: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'e1', employeeId: 'u1', employeeName: 'Rhea Castillo', department: 'Design', leaveType: 'CASUAL',
    isHalfDay: false, startDate: '2026-11-19', endDate: '2026-11-19', status: 'APPROVED', isCurrentUser: false, ...o,
  }
}

function req(o: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: 'r1', leaveType: 'CASUAL', isHalfDay: false, startDate: '2026-11-19', endDate: '2026-11-20',
    reason: 'Family event', transitionPlan: '', status: 'PENDING', createdAt: '2026-11-10', ...o,
  }
}

const details = (o: Partial<Parameters<typeof DayDetails>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(DayDetails, { dayKey: '2026-11-19', todayKey: '2026-11-10', events: [], holidays: [], onRequest: noop, ...o })
  )

test('return day: next working day, or the same day for a half day', () => {
  assert.equal(returnDateKey({ startDate: '2026-11-19', endDate: '2026-11-20', isHalfDay: false }), '2026-11-23')
  assert.equal(returnDateKey({ startDate: '2026-11-19', endDate: '2026-11-19', isHalfDay: true }), '2026-11-19')
})

test('people out are sorted by when they are back, the viewer first', () => {
  const late = event({ id: 'a', employeeId: 'a', employeeName: 'Amy Ray', endDate: '2026-11-25' })
  const soon = event({ id: 'b', employeeId: 'b', employeeName: 'Zed Cole' })
  const me = event({ id: 'c', employeeId: 'me', employeeName: 'Me Myself', endDate: '2026-11-30', isCurrentUser: true })
  assert.deepEqual(sortByReturn([late, soon, me]).map((e) => e.id), ['c', 'b', 'a'])
})

test('requests split into waiting and history; the tracker follows the status', () => {
  const rows = [
    req({ id: 'done', status: 'APPROVED' }),
    req({ id: 'later', status: 'LEAD_APPROVED', startDate: '2026-12-10' }),
    req({ id: 'sooner', status: 'PENDING', startDate: '2026-11-19' }),
    req({ id: 'gone', status: 'CANCELLED' }),
  ]
  const { waiting, history } = splitRequests(rows)
  assert.deepEqual(waiting.map((r) => r.id), ['sooner', 'later'])
  assert.deepEqual(history.map((r) => r.id), ['done', 'gone'])
  assert.equal(isWaiting('HR_APPROVED'), true)
  assert.equal(isWaiting('REJECTED'), false)
  assert.deepEqual(approvalTracker('PENDING').map((s) => s.done), [true, false, false])
  assert.deepEqual(approvalTracker('LEAD_APPROVED').map((s) => s.done), [true, true, false])
  assert.deepEqual(approvalTracker('HR_APPROVED').map((s) => s.done), [true, false, true])
  assert.deepEqual(approvalTracker('APPROVED').map((s) => s.done), [true, true, true])
})

test('day details: who is out, when they are back, and a way to request from that day', () => {
  const html = details({ events: [event({ endDate: '2026-11-20' }), event({ id: 'e2', employeeId: 'u2', employeeName: 'Noor Example', status: 'PENDING' })] })
  assert.match(html, /Thu 19 Nov/)
  assert.match(html, /1 person out/) // the pending request is listed but is not "out"
  assert.match(html, /href="\/people\/u1"[^>]*>Rhea Castillo</)
  assert.match(html, /Design · back Mon 23 Nov/)
  assert.match(html, />Pending</)
  assert.match(html, /Request leave from this day/)
})

test('day details: an empty working day says everyone is in', () => {
  const html = details()
  assert.match(html, /Everyone(&#x27;|')s in on Thu 19 Nov/)
  assert.match(html, /Nobody out/)
})

test('day details: weekends and past days cannot be requested', () => {
  assert.equal(isWeekendKey('2026-11-21'), true)
  assert.equal(isWeekendKey('2026-11-20'), false)
  const weekend = details({ dayKey: '2026-11-21' })
  assert.match(weekend, /Not a working day\./)
  assert.doesNotMatch(weekend, /Request leave from this day/)
  assert.doesNotMatch(details({ dayKey: '2026-11-09' }), /Request leave from this day/)
  assert.match(details({ dayKey: '2026-11-10' }), /Today · Nobody out/)
})

test('day details: a holiday says the office is closed', () => {
  const html = details({ dayKey: '2026-11-09', holidays: [{ id: 'h1', date: '2026-11-09', name: 'Iqbal Day' }] })
  assert.match(html, /Iqbal Day\./)
  assert.match(html, /Public holiday, office closed\./)
  assert.doesNotMatch(html, /Everyone/)
})

test('the day list shows a half day as back the same day', () => {
  const html = renderToStaticMarkup(
    createElement(DayPeopleList, { events: [event({ isHalfDay: true, halfDaySession: 'FIRST_HALF', unavailableStartTime: '09:00', unavailableEndTime: '13:00' })] })
  )
  assert.match(html, /back the same day/)
  assert.match(html, /First half · 09:00 - 13:00/)
})

test('the side panel has two tabs and a badge for requests waiting', () => {
  const panel = (o: Partial<Parameters<typeof SidePanel>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(SidePanel, {
        tab: 'day', onTabChange: noop, dayKey: '2026-11-19', todayKey: '2026-11-10', waitingCount: 2,
        day: createElement('p', null, 'DAY BODY'), requests: createElement('p', null, 'REQUESTS BODY'), ...o,
      })
    )
  const day = panel()
  assert.equal(day.match(/role="tab"/g)?.length, 2)
  assert.match(day, /aria-selected="true"[^>]*>Thu 19 Nov</)
  assert.match(day, /aria-label="2 waiting for approval"/)
  assert.match(day, /DAY BODY/)
  assert.doesNotMatch(day, /REQUESTS BODY/)
  const requests = panel({ tab: 'requests', dayKey: '2026-11-10', waitingCount: 0 })
  assert.match(requests, />Today</)
  assert.match(requests, /REQUESTS BODY/)
  assert.doesNotMatch(requests, /waiting for approval/)
})

test('my requests: waiting first with a tracker, then history', () => {
  const html = renderToStaticMarkup(
    createElement(MyRequests, {
      requests: [req({ id: 'old', status: 'APPROVED', startDate: '2026-10-05', endDate: '2026-10-05' }), req({ status: 'LEAD_APPROVED' })],
      onView: noop, onEdit: noop, onCancel: noop,
    })
  )
  assert.ok(html.indexOf('Waiting for approval') < html.indexOf('History'))
  assert.match(html, /aria-label="Approval progress: Sent done, Lead done, HR waiting"/)
  assert.equal(html.match(/Approval progress/g)?.length, 1)
})

test('my requests: nothing waiting, and no history yet', () => {
  const onlyHistory = renderToStaticMarkup(
    createElement(MyRequests, { requests: [req({ status: 'APPROVED' })], onView: noop, onEdit: noop, onCancel: noop, onRequestLeave: noop })
  )
  assert.match(onlyHistory, /Nothing waiting for approval/)
  assert.match(onlyHistory, />Request leave</)
  const onlyWaiting = renderToStaticMarkup(
    createElement(MyRequests, { requests: [req()], onView: noop, onEdit: noop, onCancel: noop })
  )
  assert.match(onlyWaiting, /No leave taken this year\./)
})

test('with day clicks on, the calendar hint explains click and drag', () => {
  const calendar = (onDayClick?: (key: string) => void) =>
    renderToStaticMarkup(
      createElement(TeamCalendar, {
        year: 2026, month: 10, onMonthChange: noop, events: [], holidays: [], birthdays: [], users: [],
        viewerDepartment: null, departmentFilter: 'ALL', onDepartmentFilterChange: noop, selection: null,
        onRangeCommit: noop, panelOpen: false, onDayClick, activeDay: '2026-11-19',
      })
    )
  assert.match(calendar(noop), /Click a day to see who(&#x27;|')s out\. Drag across days to request leave\./)
  assert.match(calendar(), /Drag across days, or click the first and last day off\./)
})

test('the calendar always keeps its right-hand column, and the old cards below it are gone', () => {
  const page = readFileSync('app/(evaluator)/leave/page.tsx', 'utf8')
  assert.match(page, /className="mt-8 grid gap-6 lg:grid-cols-\[minmax\(0,1fr\)_400px\] lg:items-start"/)
  assert.doesNotMatch(page, /panel\.open \? 'lg:grid-cols/)
  assert.doesNotMatch(page, /OutTodayCard/)
  assert.match(page, /<CalendarSideColumn/)
  assert.match(page, /onDayClick=\{side\.showDay\}/)
})
