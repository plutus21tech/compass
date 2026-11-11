import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildDayCells, buildMonthGrid } from '@/lib/time-off/calendar-grid'
import { moveFocusKey, rovingFocusKey } from '@/lib/time-off/calendar-focus'
import { TeamCalendar } from '@/components/leave/time-off/TeamCalendar'

// November 2026, "today" the 10th: the 1st-9th are past, padding days are outside the month.
const cells = buildDayCells(buildMonthGrid(2026, 10), [], '2026-11-10')

test('one tab stop: the focused day, else the selection start, else today, else the first selectable day', () => {
  assert.equal(rovingFocusKey(cells, '2026-11-25', '2026-11-19'), '2026-11-25')
  assert.equal(rovingFocusKey(cells, null, '2026-11-19'), '2026-11-19')
  assert.equal(rovingFocusKey(cells, '2026-11-03', null), '2026-11-10')
  const later = buildDayCells(buildMonthGrid(2026, 11), [], '2026-11-10')
  assert.equal(rovingFocusKey(later, null, null), '2026-12-01')
  const past = buildDayCells(buildMonthGrid(2026, 9), [], '2026-11-10')
  assert.equal(rovingFocusKey(past, null, null), null)
})

test('arrow keys move by a day or a week and stop at days that cannot be picked', () => {
  assert.equal(moveFocusKey(cells, '2026-11-19', 'ArrowRight'), '2026-11-20')
  assert.equal(moveFocusKey(cells, '2026-11-19', 'ArrowLeft'), '2026-11-18')
  assert.equal(moveFocusKey(cells, '2026-11-19', 'ArrowDown'), '2026-11-26')
  assert.equal(moveFocusKey(cells, '2026-11-19', 'ArrowUp'), '2026-11-12')
  assert.equal(moveFocusKey(cells, '2026-11-12', 'ArrowUp'), null, 'the 5th is past')
  assert.equal(moveFocusKey(cells, '2026-11-30', 'ArrowRight'), null, 'December padding')
  assert.equal(moveFocusKey(cells, '2026-11-19', 'Tab'), null)
})

test('the rendered calendar has exactly one tabbable day', () => {
  const html = renderToStaticMarkup(
    createElement(TeamCalendar, {
      year: 2099, month: 10, onMonthChange: () => {}, events: [], holidays: [], birthdays: [], users: [],
      viewerDepartment: null, departmentFilter: 'ALL', onDepartmentFilterChange: () => {},
      selection: { start: '2099-11-19', end: '2099-11-20' }, onRangeCommit: () => {}, panelOpen: false,
    })
  )
  const tabbable = html.match(/role="gridcell"[^>]*tabindex="0"/g) ?? []
  assert.equal(tabbable.length, 1)
  assert.match(tabbable[0], /data-day="2099-11-19"/)
})
