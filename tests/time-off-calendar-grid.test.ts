import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMonthGrid, buildDayCells, eventsOnDay, filterEventsByDepartment, calendarDepartments,
  monthsBetween, outToday,
} from '../lib/time-off/calendar-grid'
import type { CalendarEvent } from '../lib/time-off/types'

let seq = 0
function event(over: Partial<CalendarEvent> = {}): CalendarEvent {
  seq += 1
  return {
    id: `e${seq}`, employeeId: `emp${seq}`, employeeName: `Person ${seq}`,
    department: 'Design', leaveType: 'CASUAL', isHalfDay: false,
    startDate: '2026-11-19T00:00:00.000Z', endDate: '2026-11-19T00:00:00.000Z',
    status: 'APPROVED', isCurrentUser: false, ...over,
  }
}

test('November 2026 starts on Mon 26 Oct and has 6 weeks', () => {
  const grid = buildMonthGrid(2026, 10)
  assert.equal(grid[0].key, '2026-10-26'); assert.equal(grid.length, 42); assert.equal(grid.at(-1)!.key, '2026-12-06')
  assert.equal(grid.find((d) => d.key === '2026-11-21')!.isWeekend, true)
  assert.equal(grid.find((d) => d.key === '2026-11-20')!.isWeekend, false)
  assert.equal(grid[0].inMonth, false)
})

test('February 2027 fits in 4 weeks', () => {
  const grid = buildMonthGrid(2027, 1)
  assert.equal(grid[0].key, '2027-02-01'); assert.equal(grid.length, 28)
})

test("events spanning months appear on both months' days", () => {
  const e = event({ startDate: '2026-11-30T00:00:00.000Z', endDate: '2026-12-02T00:00:00.000Z' })
  assert.equal(eventsOnDay([e], '2026-11-30').length, 1); assert.equal(eventsOnDay([e], '2026-12-02').length, 1)
  assert.equal(eventsOnDay([e], '2026-12-03').length, 0)
})

test('day keys never pass through local Date for stored values', () => {
  assert.equal(eventsOnDay([event({ startDate: '2026-11-19T00:00:00.000Z', endDate: '2026-11-19T00:00:00.000Z' })], '2026-11-18').length, 0)
})

test('eventsOnDay sorts current user first, then name', () => {
  const a = event({ employeeName: 'Zed' }); const b = event({ employeeName: 'Amy' }); const me = event({ employeeName: 'Yan', isCurrentUser: true })
  assert.deepEqual(eventsOnDay([a, b, me], '2026-11-19').map((e) => e.employeeName), ['Yan', 'Amy', 'Zed'])
})

test('cells: 3 chips, +N more, distinct people out, busy at 5', () => {
  const me = event({ employeeId: 'me', employeeName: 'Me', isCurrentUser: true })
  const dup = event({ employeeId: 'me', employeeName: 'Me', isCurrentUser: true })
  const others = ['B', 'C', 'D', 'E'].map((n) => event({ employeeId: n, employeeName: n }))
  const cells = buildDayCells(buildMonthGrid(2026, 10), [me, dup, ...others], '2026-11-11')
  const cell = cells.find((c) => c.key === '2026-11-19')!
  assert.equal(cell.events.length, 6); assert.equal(cell.visible.length, 3); assert.equal(cell.moreCount, 3)
  assert.equal(cell.outCount, 5); assert.equal(cell.busy, true)
  assert.equal(cell.visible[0].isCurrentUser, true)
  const quiet = cells.find((c) => c.key === '2026-11-18')!
  assert.equal(quiet.busy, false); assert.equal(quiet.moreCount, 0)
})

test('padding and past days are not selectable and carry no events', () => {
  const e = event({ startDate: '2026-10-30T00:00:00.000Z', endDate: '2026-11-10T00:00:00.000Z' })
  const cells = buildDayCells(buildMonthGrid(2026, 10), [e], '2026-11-11')
  const past = cells.find((c) => c.key === '2026-11-10')!
  const pad = cells.find((c) => c.key === '2026-10-30')!
  assert.equal(past.isPast, true); assert.equal(past.selectable, false); assert.equal(past.events.length, 1)
  assert.equal(pad.selectable, false); assert.deepEqual(pad.events, [])
  assert.equal(cells.find((c) => c.key === '2026-11-11')!.isToday, true)
  assert.equal(cells.find((c) => c.key === '2026-11-11')!.selectable, true)
})

test('department filter keeps your own leave', () => {
  const d = event({ department: 'Design' }); const x = event({ department: 'Ops' })
  const me = event({ department: 'Ops', isCurrentUser: true }); const padded = event({ department: ' Design ' })
  const out = filterEventsByDepartment([d, x, me, padded], 'Design')
  assert.deepEqual(out.map((e) => e.id).sort(), [d.id, me.id, padded.id].sort())
  assert.equal(filterEventsByDepartment([d, x], 'ALL').length, 2)
})

test('calendarDepartments merges users and events, trimmed and sorted', () => {
  const list = calendarDepartments(
    [{ id: '1', name: 'A', department: ' Ops ' }, { id: '2', name: 'B', department: null }],
    [event({ department: 'Design' }), event({ department: 'Ops' }), event({ department: null })])
  assert.deepEqual(list, ['Design', 'Ops'])
})

test('monthsBetween crosses a year', () => {
  assert.deepEqual(monthsBetween('2026-12-28', '2027-01-04'), [{ year: 2026, month: 11 }, { year: 2027, month: 0 }])
  assert.deepEqual(monthsBetween('2026-12-28', '2026-12-01'), [])
  assert.deepEqual(monthsBetween('nope', '2026-12-01'), [])
  assert.equal(monthsBetween('2026-01-01', '2030-01-01').length, 13)
})

test('out today: approved colleagues only', () => {
  const ok = event({}); const pending = event({ status: 'PENDING' }); const mine = event({ isCurrentUser: true })
  const elsewhere = event({ startDate: '2026-11-20T00:00:00.000Z', endDate: '2026-11-20T00:00:00.000Z' })
  assert.deepEqual(outToday([ok, pending, mine, elsewhere], '2026-11-19').map((e) => e.id), [ok.id])
})
