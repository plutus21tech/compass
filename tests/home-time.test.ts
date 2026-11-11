import test from 'node:test'
import assert from 'node:assert/strict'
import { karachiDayKey, dayKeyOf, daysBetween, addDays, greetingFor, inDaysPhrase } from '../lib/home/time'
import { homeSummary } from '../lib/home/summary'

test('today is the Karachi day after 19:00 UTC', () => {
  assert.equal(karachiDayKey(new Date('2026-11-11T18:59:00Z')), '2026-11-11')
  assert.equal(karachiDayKey(new Date('2026-11-11T19:00:00Z')), '2026-11-12')
})
test('date-only values keep their calendar day', () => {
  assert.equal(dayKeyOf('2026-12-25T00:00:00.000Z'), '2026-12-25')
  assert.equal(dayKeyOf(new Date('2026-12-25T00:00:00.000Z')), '2026-12-25')
})
test('days between and in-days phrase', () => {
  assert.equal(daysBetween('2026-11-11', '2026-12-25'), 44)
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.deepEqual([0, 1, 44].map(inDaysPhrase), ['Today', 'Tomorrow', 'In 44 days'])
})
test('greeting by the reader\'s own hour', () => {
  assert.deepEqual([0, 11, 12, 16, 17, 23].map(greetingFor), ['Good morning', 'Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening'])
})
test('summary counts what needs you and who is out in your department', () => {
  assert.equal(homeSummary({ needsYou: 2, department: 'Design', departmentOutToday: 0 }), '2 things need you. Everyone in Design is in today.')
  assert.equal(homeSummary({ needsYou: 1, department: 'Design', departmentOutToday: 1 }), '1 thing needs you. 1 person in Design is out today.')
  assert.equal(homeSummary({ needsYou: 0, department: 'Design', departmentOutToday: 3 }), 'Nothing needs you right now. 3 people in Design are out today.')
})
test('summary leaves out the department sentence without a department', () => {
  assert.equal(homeSummary({ needsYou: 2, department: null, departmentOutToday: null }), '2 things need you.')
  assert.equal(homeSummary({ needsYou: null, department: 'Design', departmentOutToday: 0 }), 'Everyone in Design is in today.')
})
