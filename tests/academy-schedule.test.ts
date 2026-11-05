import test from 'node:test'
import assert from 'node:assert/strict'
import { holidayTeamFor, moduleDueAt } from '../lib/academy/schedule'

const base = { timeZone: 'Asia/Karachi', holidayKeys: new Set<string>() }
const due = (phase: 'DAY_1' | 'WEEK_1', date: string, holidayKeys = base.holidayKeys) =>
  moduleDueAt({ phase, joiningDate: new Date(`${date}T00:00:00Z`), timeZone: base.timeZone, holidayKeys }).toISOString()

test('Tuesday join: day 1 same day, week 1 one week later', () => {
  assert.equal(due('DAY_1', '2026-12-01'), '2026-12-01T18:59:59.999Z')
  assert.equal(due('WEEK_1', '2026-12-01'), '2026-12-08T18:59:59.999Z')
})

test('a holiday pushes week 1 out by a day', () => {
  assert.equal(due('WEEK_1', '2026-12-01', new Set(['2026-12-03'])), '2026-12-09T18:59:59.999Z')
})

test('Friday join: week 1 is the next Friday', () => {
  assert.equal(due('WEEK_1', '2026-12-04'), '2026-12-11T18:59:59.999Z')
})

test('weekend join: day 1 stays, week 1 counts from Monday as working day 1', () => {
  assert.equal(due('DAY_1', '2026-12-05'), '2026-12-05T18:59:59.999Z')
  assert.equal(due('WEEK_1', '2026-12-05'), '2026-12-11T18:59:59.999Z')
  assert.equal(due('WEEK_1', '2026-12-06'), '2026-12-11T18:59:59.999Z')
})

test('holidayTeamFor prefers the tag, then the office, else null', () => {
  assert.equal(holidayTeamFor(null, 'BOGOTA'), 'COLOMBIA')
  assert.equal(holidayTeamFor('MOROCCO', 'KARACHI'), 'MOROCCO')
  assert.equal(holidayTeamFor(null, 'KARACHI'), 'PAKISTAN')
  assert.equal(holidayTeamFor(null, 'CASABLANCA'), 'MOROCCO')
  assert.equal(holidayTeamFor(null, 'DALLAS'), null)
  assert.equal(holidayTeamFor(null, null), null)
})
