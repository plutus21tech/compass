import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeLeaveRequest } from '@/lib/time-off/request-summary'

const base = { isHalfDay: false, holidayKeys: new Set<string>(), remaining: 5 as number | null, total: 10 as number | null, balanceYear: 2026 }

test('Thu 19 to Mon 23 Nov: 3 working days, 2 weekend days, back Tue 24', () => {
  const s = summarizeLeaveRequest({ ...base, startDate: '2026-11-19', endDate: '2026-11-23' })
  assert.deepEqual([s.problem, s.workingDays, s.weekendDays, s.holidayDays, s.returnKey, s.balanceAfter], [null, 3, 2, 0, '2026-11-24', 2])
})
test('holidays from every touched month are counted', () => {
  const s = summarizeLeaveRequest({ ...base, startDate: '2026-11-30', endDate: '2026-12-02', holidayKeys: new Set(['2026-11-30', '2026-12-01']) })
  assert.deepEqual([s.workingDays, s.holidayDays], [1, 2])
})
test('a half day counts 0.5 and returns the same day', () => {
  const s = summarizeLeaveRequest({ ...base, startDate: '2026-11-19', endDate: '2026-11-25', isHalfDay: true })
  assert.deepEqual([s.workingDays, s.endKey, s.returnKey, s.sameDayReturn, s.balanceAfter], [0.5, '2026-11-19', '2026-11-19', true, 4.5])
})
test('a half day on a Saturday has no working days', () => {
  assert.equal(summarizeLeaveRequest({ ...base, startDate: '2026-11-21', endDate: '2026-11-21', isHalfDay: true }).problem, 'no-working-days')
})
test('a weekend-only range has no working days', () => {
  const s = summarizeLeaveRequest({ ...base, startDate: '2026-11-21', endDate: '2026-11-22' })
  assert.deepEqual([s.problem, s.weekendDays], ['no-working-days', 2])
})
test('end before start and missing dates', () => {
  assert.equal(summarizeLeaveRequest({ ...base, startDate: '2026-11-23', endDate: '2026-11-19' }).problem, 'end-before-start')
  assert.equal(summarizeLeaveRequest({ ...base, startDate: '', endDate: '' }).problem, 'missing-dates')
})
test('a half day needs only a start date', () => {
  assert.equal(summarizeLeaveRequest({ ...base, startDate: '2026-11-19', endDate: '', isHalfDay: true }).problem, null)
})
test('over balance is flagged; next year shows no balance after', () => {
  assert.equal(summarizeLeaveRequest({ ...base, remaining: 2, startDate: '2026-11-19', endDate: '2026-11-23' }).overBalance, true)
  const next = summarizeLeaveRequest({ ...base, startDate: '2027-01-04', endDate: '2027-01-05' })
  assert.deepEqual([next.balanceAfter, next.otherYear, next.overBalance], [null, true, false])
})
test('unknown remaining gives no balance after', () => {
  const s = summarizeLeaveRequest({ ...base, remaining: null, startDate: '2026-11-19', endDate: '2026-11-20' })
  assert.deepEqual([s.balanceAfter, s.overBalance, s.otherYear], [null, false, false])
})
test('ranges over a year are refused', () => {
  assert.equal(summarizeLeaveRequest({ ...base, startDate: '2026-11-19', endDate: '2027-12-01' }).problem, 'too-long')
})
test('a Friday end returns on Monday', () => {
  assert.equal(summarizeLeaveRequest({ ...base, startDate: '2026-11-20', endDate: '2026-11-20' }).returnKey, '2026-11-23')
})
