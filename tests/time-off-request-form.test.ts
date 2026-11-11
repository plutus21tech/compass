import test from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_REQUEST_FORM, formFromRequest, halfDayError, isFormDirty, isHalfDayEligible, stepError,
  toLeavePayload, toLeaveUpdatePayload, withDates, withHalfDay, withLeaveType, withSession,
  LEAVE_TYPE_LABEL, type RequestForm,
} from '@/lib/time-off/request-form'
import { summarizeLeaveRequest } from '@/lib/time-off/request-summary'
import type { LeaveRequest } from '@/lib/time-off/types'
import type { TransitionTask } from '@/lib/leave-transition-plan'

const sumBase = { isHalfDay: false, holidayKeys: new Set<string>(), remaining: 5 as number | null, total: 10 as number | null, balanceYear: 2026 }
const valid: RequestForm = { ...EMPTY_REQUEST_FORM, startDate: '2026-11-19', endDate: '2026-11-20', reason: 'Family event' }
const sum = (f: RequestForm, over: Partial<typeof sumBase> = {}) =>
  summarizeLeaveRequest({ ...sumBase, ...over, startDate: f.startDate, endDate: f.endDate, isHalfDay: f.isHalfDay })
const err = (step: 1 | 2 | 3, f: RequestForm, over: Partial<typeof sumBase> = {}) => stepError(step, f, sum(f, over))
const task = (): TransitionTask => ({ taskDetails: 'x', projectDept: '', assignedTo: '', accepted: null, deadline: null, completed: null, variance: '', links: '' })

test('labels are shared', () => assert.equal(LEAVE_TYPE_LABEL.ANNUAL, 'Annual'))
test('half day eligibility', () => {
  assert.deepEqual((['CASUAL', 'SICK', 'ANNUAL'] as const).map(isHalfDayEligible), [true, true, false])
})
test('withLeaveType ANNUAL clears half-day fields', () => {
  const f = withLeaveType({ ...valid, isHalfDay: true, halfDaySession: 'FIRST_HALF', unavailableStartTime: '09:00', unavailableEndTime: '13:00' }, 'ANNUAL')
  assert.deepEqual([f.leaveType, f.isHalfDay, f.halfDaySession, f.unavailableStartTime, f.unavailableEndTime], ['ANNUAL', false, '', '', ''])
})
test('withLeaveType SICK keeps half day', () => {
  assert.equal(withLeaveType({ ...valid, isHalfDay: true }, 'SICK').isHalfDay, true)
})
test('withHalfDay copies start to end, and off clears session and times', () => {
  const on = withHalfDay(valid, true)
  assert.deepEqual([on.isHalfDay, on.endDate], [true, '2026-11-19'])
  const off = withHalfDay({ ...on, halfDaySession: 'FIRST_HALF', unavailableStartTime: '09:00', unavailableEndTime: '13:00' }, false)
  assert.deepEqual([off.isHalfDay, off.halfDaySession, off.unavailableStartTime, off.unavailableEndTime], [false, '', '', ''])
})
test('withHalfDay leaves end alone when no start', () => {
  assert.equal(withHalfDay(EMPTY_REQUEST_FORM, true).endDate, '')
})
test('withSession fills empty times and keeps typed ones', () => {
  const s = withSession(valid, 'SECOND_HALF')
  assert.deepEqual([s.halfDaySession, s.unavailableStartTime, s.unavailableEndTime], ['SECOND_HALF', '14:00', '18:00'])
  const t = withSession({ ...valid, unavailableStartTime: '10:00' }, 'FIRST_HALF')
  assert.deepEqual([t.unavailableStartTime, t.unavailableEndTime], ['10:00', '13:00'])
})
test('withDates forces end = start under half day', () => {
  assert.equal(withDates(withHalfDay(valid, true), '2026-11-24', '2026-11-26').endDate, '2026-11-24')
  assert.equal(withDates(valid, '2026-11-24', '2026-11-26').endDate, '2026-11-26')
})
test('halfDayError messages', () => {
  const h = { ...valid, isHalfDay: true }
  assert.equal(halfDayError(h), 'Select first half or second half')
  assert.equal(halfDayError({ ...h, halfDaySession: 'FIRST_HALF' }), 'Enter unavailable start and end time for half-day leave')
  assert.equal(halfDayError({ ...h, halfDaySession: 'FIRST_HALF', unavailableStartTime: '13:00', unavailableEndTime: '09:00' }), 'Unavailable end time must be after start time')
  assert.equal(halfDayError({ ...h, halfDaySession: 'FIRST_HALF', unavailableStartTime: '09:00', unavailableEndTime: '13:00' }), null)
  assert.equal(halfDayError(valid), null)
})
test('stepError step 1 rows', () => {
  assert.equal(err(1, { ...valid, startDate: '' }), 'Pick your first day off')
  assert.equal(err(1, { ...valid, endDate: '' }), 'Pick your last day off')
  assert.equal(err(1, { ...valid, startDate: '2026-11-23', endDate: '2026-11-19' }), 'Your last day off is before your first day off')
  assert.equal(err(1, { ...valid, isHalfDay: true, endDate: valid.startDate }), 'Select first half or second half')
  assert.equal(err(1, { ...valid, endDate: '2027-12-01' }), 'Pick a shorter range')
  assert.equal(err(1, { ...valid, startDate: '2026-11-21', endDate: '2026-11-22' }), 'These dates have no working days to take off')
  assert.equal(err(1, { ...valid, startDate: '2026-11-19', endDate: '2026-11-23' }, { remaining: 2 }), 'You have 2 days of casual leave left.')
  assert.equal(err(1, { ...valid, reason: '   ' }), 'Add a reason')
  assert.equal(err(1, { ...valid, reason: 'a'.repeat(4001) }), 'Keep the reason under 4,000 characters')
  assert.equal(err(1, valid), null)
})
test('stepError over-balance uses the type label lower-case', () => {
  assert.equal(err(1, { ...valid, leaveType: 'SICK', endDate: '2026-11-20' }, { remaining: 1 }), 'You have 1 day of sick leave left.')
})
test('stepError steps 2 and 3', () => {
  assert.equal(err(2, { ...valid, transitionPlan: 'a'.repeat(6001) }), 'Keep handover notes under 6,000 characters')
  assert.equal(err(2, { ...valid, tasks: Array.from({ length: 51 }, task) }), 'A plan can have up to 50 tasks')
  assert.equal(err(2, valid), null)
  assert.equal(err(3, { ...valid, coverPersonIds: Array.from({ length: 11 }, (_, i) => `u${i}`) }), 'Choose up to 10 cover people')
  assert.equal(err(3, { ...valid, additionalNotifyIds: Array.from({ length: 21 }, (_, i) => `u${i}`) }), 'Choose up to 20 people to notify')
  assert.equal(err(3, valid), null)
})
test('toLeavePayload for a half-day Casual', () => {
  const f = withSession(withHalfDay({ ...valid, startDate: '2026-11-19', endDate: '2026-11-19', reason: 'Clinic visit' }, true), 'FIRST_HALF')
  assert.deepEqual(toLeavePayload(f, 'Asia/Karachi'), {
    leaveType: 'CASUAL', startDate: '2026-11-19', endDate: '2026-11-19', isHalfDay: true, requestTimezone: 'Asia/Karachi',
    halfDaySession: 'FIRST_HALF', unavailableStartTime: '09:00', unavailableEndTime: '13:00', reason: 'Clinic visit',
    transitionPlan: undefined, coverPersonIds: [], additionalNotifyIds: [],
  })
})
test('toLeavePayload for Annual drops stale half-day values and keeps notes', () => {
  const f: RequestForm = { ...valid, leaveType: 'ANNUAL', isHalfDay: true, halfDaySession: 'FIRST_HALF', unavailableStartTime: '09:00', unavailableEndTime: '13:00', transitionPlan: 'notes', coverPersonIds: ['a'], additionalNotifyIds: ['b'] }
  const p = toLeavePayload(f, 'UTC')
  assert.deepEqual(p, {
    leaveType: 'ANNUAL', startDate: '2026-11-19', endDate: '2026-11-20', isHalfDay: false, requestTimezone: 'UTC',
    halfDaySession: undefined, unavailableStartTime: undefined, unavailableEndTime: undefined, reason: 'Family event',
    transitionPlan: 'notes', coverPersonIds: ['a'], additionalNotifyIds: ['b'],
  })
  assert.deepEqual(Object.keys(p), ['leaveType', 'startDate', 'endDate', 'isHalfDay', 'requestTimezone', 'halfDaySession', 'unavailableStartTime', 'unavailableEndTime', 'reason', 'transitionPlan', 'coverPersonIds', 'additionalNotifyIds'])
})
test('a half day payload forces end = start even if the form drifted', () => {
  const f: RequestForm = { ...valid, isHalfDay: true, halfDaySession: 'FIRST_HALF', unavailableStartTime: '09:00', unavailableEndTime: '13:00' }
  assert.equal(toLeavePayload(f, 'UTC').endDate, '2026-11-19')
})
test('toLeaveUpdatePayload matches the PUT body', () => {
  const p = toLeaveUpdatePayload('r1', valid, 'UTC')
  assert.deepEqual(Object.keys(p), ['id', 'leaveType', 'isHalfDay', 'requestTimezone', 'halfDaySession', 'unavailableStartTime', 'unavailableEndTime', 'startDate', 'endDate', 'reason', 'transitionPlan', 'coverPersonIds', 'additionalNotifyIds'])
  assert.equal(p.id, 'r1')
  assert.equal(p.transitionPlan, undefined)
})
const req = (over: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id: 'r1', leaveType: 'SICK', isHalfDay: false, startDate: '2026-11-19T00:00:00.000Z', endDate: '2026-11-20T00:00:00.000Z',
  reason: 'Flu', transitionPlan: 'notes', status: 'PENDING', createdAt: '2026-11-01T00:00:00.000Z', ...over,
})
test('formFromRequest maps a legacy single cover person', () => {
  const f = formFromRequest(req({ coverPerson: { id: 'c1', name: 'Cover' }, additionalNotifyIds: ['n1'] }))
  assert.deepEqual([f.coverPersonIds, f.additionalNotifyIds, f.startDate, f.endDate, f.halfDaySession, f.tasks], [['c1'], ['n1'], '2026-11-19', '2026-11-20', '', []])
})
test('formFromRequest prefers coverPeople and reads stored tasks', () => {
  const f = formFromRequest(req({ coverPeople: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], transitionPlanTasks: [task()] }))
  assert.deepEqual(f.coverPersonIds, ['a', 'b'])
  assert.equal(f.tasks.length, 1)
})
test('formFromRequest tolerates invalid stored tasks', () => {
  const bad = [{ taskDetails: 'x'.repeat(3000) }] as unknown as LeaveRequest['transitionPlanTasks']
  assert.deepEqual(formFromRequest(req({ transitionPlanTasks: bad })).tasks, [])
})
test('isFormDirty', () => {
  assert.equal(isFormDirty(EMPTY_REQUEST_FORM), false)
  assert.equal(isFormDirty(withDates(EMPTY_REQUEST_FORM, '2026-11-19', '')), true)
})
