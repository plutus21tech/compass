import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildDayCells, buildMonthGrid, type DayCell } from '@/lib/time-off/calendar-grid'
import { CalendarDayCell } from '@/components/leave/time-off/CalendarDayCell'
import { TeamCalendar, shouldCancelRange } from '@/components/leave/time-off/TeamCalendar'
import { DayLeaveDialog } from '@/components/leave/time-off/DayLeaveDialog'
import type { CalendarEvent } from '@/lib/time-off/types'

let counter = 0
function event(o: Partial<CalendarEvent> = {}): CalendarEvent {
  counter += 1
  return {
    id: `e${counter}`,
    employeeId: `u${counter}`,
    employeeName: `Person${counter} Surname`,
    department: 'Design',
    leaveType: 'CASUAL',
    isHalfDay: false,
    startDate: '2026-11-19',
    endDate: '2026-11-19',
    status: 'APPROVED',
    isCurrentUser: false,
    ...o,
  }
}

function cellWith(events: CalendarEvent[]): DayCell {
  const cells = buildDayCells(buildMonthGrid(2026, 10), events, '2026-11-10')
  return cells.find((c) => c.key === '2026-11-19') as DayCell
}

function renderCell(cell: DayCell, selected = false): string {
  return renderToStaticMarkup(
    createElement(CalendarDayCell, { cell, holidays: [], birthdays: [], selected, onMoreClick: () => {} })
  )
}

test("a colleague's annual leave chip is emerald and shows only the first name", () => {
  const html = renderCell(cellWith([event({ employeeName: 'Rhea Castillo', leaveType: 'ANNUAL' })]))
  assert.match(html, /bg-emerald-100[^"]*"[^>]*>Rhea</)
  assert.doesNotMatch(html, /Castillo</)
})

test('own chips say You and carry the primary ring; pending chips are faded', () => {
  const html = renderCell(cellWith([event({ isCurrentUser: true, status: 'PENDING', employeeName: 'Ammar Hassan' })]))
  assert.match(html, />You</)
  assert.match(html, /ring-primary/)
  assert.match(html, /opacity-60/)
  assert.doesNotMatch(html, />Ammar</)
})

test('half days are marked with a half sign and the session in the tooltip', () => {
  const html = renderCell(
    cellWith([event({ employeeName: 'Rhea Castillo', isHalfDay: true, halfDaySession: 'FIRST_HALF' })])
  )
  assert.match(html, />Rhea ½</)
  assert.match(html, /title="[^"]*\(First half\)"/)
})

test('+N more and N out', () => {
  const events = Array.from({ length: 5 }, () => event())
  const html = renderCell(cellWith(events))
  assert.match(html, /\+2 more/)
  assert.match(html, /text-amber-700[^>]*>5 out</)
  assert.match(html, /<button[^>]*type="button"[^>]*>\+2 more/)
})

test('a quiet day shows a plain out count without the busy style', () => {
  const html = renderCell(cellWith([event()]))
  assert.match(html, />1 out</)
  assert.doesNotMatch(html, /text-amber-700/)
})

test('cells expose their day for pointer and e2e use', () => {
  const html = renderCell(cellWith([]))
  assert.match(html, /data-day="2026-11-19"/)
  assert.match(html, /role="gridcell"/)
  assert.match(html, /tabindex="0"/)
})

test('past days and padding days are not focusable', () => {
  const cells = buildDayCells(buildMonthGrid(2026, 10), [], '2026-11-10')
  const past = renderCell(cells.find((c) => c.key === '2026-11-03') as DayCell)
  const padding = renderCell(cells[0])
  for (const html of [past, padding]) {
    assert.match(html, /tabindex="-1"/)
    assert.match(html, /aria-disabled="true"/)
    assert.match(html, /opacity-50/)
  }
})

test('a selected day is highlighted and today gets the pill', () => {
  assert.match(renderCell(cellWith([]), true), /bg-primary\/10[^"]*ring-primary/)
  const selectedHtml = renderCell(cellWith([]), true)
  assert.doesNotMatch(selectedHtml, /bg-card/)
  assert.doesNotMatch(selectedHtml, /bg-muted\/40/)
  const today = buildDayCells(buildMonthGrid(2026, 10), [], '2026-11-19').find((c) => c.key === '2026-11-19') as DayCell
  assert.match(renderCell(today), /bg-foreground text-background rounded-full/)
})

function renderCalendar(props: Partial<Parameters<typeof TeamCalendar>[0]> = {}): string {
  return renderToStaticMarkup(
    createElement(TeamCalendar, {
      year: 2026,
      month: 10,
      onMonthChange: () => {},
      events: [event({ employeeName: 'Rhea Castillo' })],
      holidays: [],
      birthdays: [],
      users: [
        { id: 'a', name: 'A', department: 'Design' },
        { id: 'b', name: 'B', department: 'Finance' },
      ],
      viewerDepartment: 'Design',
      departmentFilter: 'ALL',
      onDepartmentFilterChange: () => {},
      selection: { start: '2026-11-19', end: '2026-11-20' },
      onRangeCommit: () => {},
      panelOpen: false,
      ...props,
    })
  )
}

test('the calendar has a month title, month buttons, weekday header and a hint', () => {
  const html = renderCalendar()
  assert.match(html, /November 2026/)
  assert.match(html, /aria-label="Previous month"/)
  assert.match(html, /aria-label="Next month"/)
  for (const d of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) assert.match(html, new RegExp(`>${d}<`))
  assert.match(html, /Drag across days, or click the first and last day off\./)
  assert.doesNotMatch(html, /Cancel/)
})

test('the calendar offers Everyone and the viewer department, and the legend', () => {
  const html = renderCalendar()
  assert.match(html, />Everyone</)
  assert.match(html, />Design</)
  assert.match(html, /Casual/)
  assert.match(html, /Annual/)
  assert.match(html, /Your requests/)
  assert.match(html, /Holiday/)
})

test('the calendar renders one cell per grid day and highlights the selection', () => {
  const html = renderCalendar()
  assert.equal((html.match(/role="gridcell"/g) ?? []).length, 42)
  assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 2)
})

test('with the panel open the hint says to drag again', () => {
  const html = renderCalendar({ panelOpen: true })
  assert.match(html, /Drag again/)
  assert.match(html, /to change the dates\./)
})

test('the day dialog renders nothing while closed', () => {
  const html = renderToStaticMarkup(
    createElement(DayLeaveDialog, { open: false, dayKey: '2026-11-19', events: [event()], onClose: () => {} })
  )
  assert.equal(html, '')
})

test('Escape cancels a range in progress and is ignored when idle', () => {
  assert.equal(shouldCancelRange('Escape', 'picking-end'), true)
  assert.equal(shouldCancelRange('Escape', 'dragging'), true)
  assert.equal(shouldCancelRange('Escape', 'idle'), false)
  assert.equal(shouldCancelRange('Enter', 'dragging'), false)
})

test('the hint sits in a polite live region', () => {
  assert.match(renderCalendar(), /aria-live="polite"/)
})
