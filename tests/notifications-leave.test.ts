import test from 'node:test'
import assert from 'node:assert/strict'
import { leaveNoticeTitle, wfhNoticeTitle, scopeDedupeKey, type LeaveNoticeSubject } from '../lib/notifications/leave'

const now = new Date('2026-11-11T06:00:00Z')
const deadline = new Date('2026-11-16T00:00:00Z')
const annual: LeaveNoticeSubject = {
  id: 'r1',
  employeeId: 'e1',
  leaveType: 'ANNUAL',
  isHalfDay: false,
  startDate: new Date('2026-11-19T00:00:00Z'),
  endDate: new Date('2026-11-23T00:00:00Z'),
}
const RANGE = 'annual leave, Thu 19 – Mon 23 Nov'

test('every event title matches the table', () => {
  assert.equal(leaveNoticeTitle('LEAVE_APPROVED', annual, { now }), `Your ${RANGE}, was approved`)
  assert.equal(leaveNoticeTitle('LEAVE_REJECTED', annual, { now }), `Your ${RANGE}, was not approved`)
  assert.equal(leaveNoticeTitle('LEAVE_CANCELLED', annual, { now }), `Your ${RANGE}, was cancelled`)
  assert.equal(leaveNoticeTitle('PLAN_REMINDER', annual, { now }), `Add a transition plan for your ${RANGE}`)
  assert.equal(leaveNoticeTitle('PLAN_DEADLINE_NOTICE', annual, { now, deadline }), `Add a transition plan by Mon 16 Nov for your ${RANGE}`)
  assert.equal(
    leaveNoticeTitle('PLAN_FINAL_WARNING', annual, { now, deadline }),
    `Last reminder: add a transition plan by Mon 16 Nov or your ${RANGE}, will be cancelled`,
  )
  assert.equal(leaveNoticeTitle('PLAN_DISAPPROVED', annual, { now }), `Your lead sent back the transition plan for your ${RANGE}`)
})

test('WFH titles', () => {
  const wfh = { startDate: annual.startDate, endDate: annual.endDate }
  assert.equal(wfhNoticeTitle('WFH_APPROVED', wfh, { now }), 'Your work-from-home request, Thu 19 – Mon 23 Nov, was approved')
  assert.equal(wfhNoticeTitle('WFH_REJECTED', wfh, { now }), 'Your work-from-home request, Thu 19 – Mon 23 Nov, was not approved')
})

test('half days name the single day', () => {
  const half = { id: 'r1', employeeId: 'e1', leaveType: 'CASUAL' as const, isHalfDay: true, startDate: new Date('2026-11-19T00:00:00Z'), endDate: new Date('2026-11-19T00:00:00Z') }
  assert.equal(leaveNoticeTitle('LEAVE_APPROVED', half, { now }), 'Your casual half day, Thu 19 Nov, was approved')
})

test('another year shows the year', () => {
  const later = { ...annual, startDate: new Date('2027-01-04T00:00:00Z'), endDate: new Date('2027-01-05T00:00:00Z') }
  assert.equal(leaveNoticeTitle('LEAVE_REJECTED', later, { now }), 'Your annual leave, Mon 4 – Tue 5 Jan 2027, was not approved')
})

test('dedupe keys are scoped to the recipient', () => {
  assert.equal(scopeDedupeKey('plan-notice:r1', 'u1'), 'plan-notice:r1:u1')
  assert.notEqual(scopeDedupeKey('plan-notice:r1', 'u1'), scopeDedupeKey('plan-notice:r1', 'u2'))
  assert.equal(scopeDedupeKey(undefined, 'u1'), undefined)
})
