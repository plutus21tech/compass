import test from 'node:test'
import assert from 'node:assert/strict'
import {
  approvalActions,
  canCancelRequest,
  canCancelWfhRequest,
  canEditRequest,
  decisionToast,
  isLeaveNotStarted,
  planEditable,
  planRequiredFor,
  planReminderRequests,
  planReviewState,
  requestCoverPeople,
  requestDays,
} from '../lib/time-off/request-rules'
import { toDateKey, type ApprovalRequest, type LeaveRequest } from '../lib/time-off/types'
import { halfDaySessionLabel, halfDayWindowLabel, LEAVE_TYPE_STYLE } from '../components/leave/time-off/leave-style'
import { LEAVE_TYPE_LABEL, LEAVE_TYPE_TONE } from '../lib/leave-type-style'

const now = new Date(2026, 10, 11, 10)

const leave = (overrides: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id: 'l1',
  leaveType: 'CASUAL',
  isHalfDay: false,
  startDate: '2026-11-19T00:00:00.000Z',
  endDate: '2026-11-20T00:00:00.000Z',
  reason: 'Family event',
  transitionPlan: '',
  status: 'PENDING',
  createdAt: '2026-11-01T00:00:00.000Z',
  ...overrides,
})

const withEmployee = (overrides: Partial<LeaveRequest> = {}, department: string | null = 'Product'): ApprovalRequest => ({
  ...leave(overrides),
  employee: { id: 'e1', name: 'Test Person', department, position: null },
})

test('toDateKey keeps the stored calendar day', () => {
  assert.equal(toDateKey('2026-11-19T00:00:00.000Z'), '2026-11-19')
  assert.equal(toDateKey('2026-11-19'), '2026-11-19')
  assert.equal(toDateKey('not a date'), '')
})

test('a leave can be cancelled until the day before its last day', () => {
  assert.equal(canCancelRequest(leave({ status: 'APPROVED', endDate: '2026-11-12T00:00:00.000Z' }), now), true)
  assert.equal(canCancelRequest(leave({ status: 'APPROVED', endDate: '2026-11-11T00:00:00.000Z' }), now), false)
  assert.equal(canCancelRequest(leave({ status: 'REJECTED', endDate: '2026-12-01T00:00:00.000Z' }), now), false)
  assert.equal(canCancelRequest(leave({ status: 'PENDING', endDate: '2026-12-01T00:00:00.000Z' }), now), true)
})

test('only pending statuses are editable', () => {
  for (const s of ['PENDING', 'LEAD_APPROVED', 'HR_APPROVED']) assert.equal(canEditRequest({ status: s }), true)
  for (const s of ['APPROVED', 'REJECTED', 'CANCELLED']) assert.equal(canEditRequest({ status: s }), false)
})

test('plan rule: 3E, half days and single sick days need none', () => {
  assert.equal(planRequiredFor(leave({ leaveType: 'ANNUAL' }), 'Product'), true)
  assert.equal(planRequiredFor(leave({ leaveType: 'ANNUAL' }), '3E'), false)
  assert.equal(planRequiredFor(leave({ leaveType: 'CASUAL', isHalfDay: true }), 'Product'), false)
  assert.equal(
    planRequiredFor(leave({ leaveType: 'SICK', startDate: '2026-11-19T00:00:00.000Z', endDate: '2026-11-19T00:00:00.000Z' }), 'Product'),
    false
  )
  // a lead's queue row uses the applicant's department, not the viewer's
  assert.equal(planRequiredFor(withEmployee({ leaveType: 'ANNUAL' }, '3E'), 'Product'), false)
  assert.equal(planRequiredFor(withEmployee({ leaveType: 'ANNUAL' }, 'Product'), '3E'), true)
})

test('reminders cover leave starting in 0 to 3 days without a plan', () => {
  const rows = [
    leave({ id: 'today', startDate: '2026-11-11T00:00:00.000Z', endDate: '2026-11-13T00:00:00.000Z' }),
    leave({ id: 'in3', startDate: '2026-11-14T00:00:00.000Z', endDate: '2026-11-16T00:00:00.000Z' }),
    leave({ id: 'in4', startDate: '2026-11-15T00:00:00.000Z', endDate: '2026-11-17T00:00:00.000Z' }),
    leave({ id: 'past', startDate: '2026-11-10T00:00:00.000Z', endDate: '2026-11-13T00:00:00.000Z' }),
    leave({ id: 'done', startDate: '2026-11-12T00:00:00.000Z', transitionPlanSubmittedAt: '2026-11-10T09:00:00.000Z' }),
    leave({ id: 'rejected', status: 'REJECTED', startDate: '2026-11-12T00:00:00.000Z' }),
    leave({ id: 'approved', status: 'APPROVED', startDate: '2026-11-12T00:00:00.000Z' }),
  ]
  assert.deepEqual(planReminderRequests(rows, 'Product', now).map((r) => r.id), ['today', 'in3', 'approved'])
  assert.deepEqual(planReminderRequests(rows, '3E', now), [])
})

test('plan is editable before the leave starts unless submitted and not sent back', () => {
  const future = '2026-11-19T00:00:00.000Z'
  assert.equal(planEditable(leave({ startDate: future }), now), true)
  assert.equal(planEditable(leave({ startDate: future, transitionPlanSubmittedAt: '2026-11-10T00:00:00.000Z', transitionPlanLeadStatus: 'PENDING' }), now), false)
  assert.equal(planEditable(leave({ startDate: future, transitionPlanSubmittedAt: '2026-11-10T00:00:00.000Z', transitionPlanLeadStatus: 'DISAPPROVED' }), now), true)
  assert.equal(planEditable(leave({ startDate: '2026-11-10T00:00:00.000Z' }), now), false)
  assert.equal(planEditable(leave({ startDate: '2026-11-11T00:00:00.000Z' }), now), true)
  assert.equal(planEditable(leave({ startDate: future, status: 'CANCELLED' }), now), false)
  assert.equal(planEditable(leave({ startDate: future, status: 'REJECTED' }), now), false)
  assert.equal(isLeaveNotStarted('garbage', now), true)
})

test('approval actions: approved leave can only be disapproved', () => {
  assert.deepEqual(approvalActions({ status: 'APPROVED' }), { showApprove: false, reject: 'disapprove', rejectLabel: 'Disapprove' })
  assert.deepEqual(approvalActions({ status: 'LEAD_APPROVED' }), { showApprove: true, reject: 'reject', rejectLabel: 'Reject' })
})

test('plan review states', () => {
  const submitted = '2026-11-10T09:00:00.000Z'
  assert.equal(planReviewState(withEmployee({ transitionPlanSubmittedAt: submitted, transitionPlanLeadStatus: 'PENDING' })), 'review')
  assert.equal(planReviewState(withEmployee({ transitionPlanSubmittedAt: submitted, transitionPlanLeadStatus: 'APPROVED' })), 'approved')
  assert.equal(planReviewState(withEmployee({ leaveType: 'ANNUAL' })), 'missing')
  assert.equal(planReviewState(withEmployee({ leaveType: 'ANNUAL' }, '3E')), 'not-needed')
  assert.equal(planReviewState(withEmployee({ isHalfDay: true })), 'not-needed')
})

test('decision toasts', () => {
  assert.equal(decisionToast('approve'), 'Leave approved')
  assert.equal(decisionToast('reject', 'CANCELLED'), 'Leave cancelled')
  assert.equal(decisionToast('reject', 'REJECTED'), 'Leave rejected')
})

test('WFH can be cancelled until it has ended', () => {
  assert.equal(canCancelWfhRequest({ status: 'APPROVED', endDate: '2026-11-11T00:00:00.000Z' }, now), true)
  assert.equal(canCancelWfhRequest({ status: 'APPROVED', endDate: '2026-11-10T00:00:00.000Z' }, now), false)
  assert.equal(canCancelWfhRequest({ status: 'REJECTED', endDate: '2026-11-20T00:00:00.000Z' }, now), false)
})

test('cover people fall back to the single cover person; days prefer the API count', () => {
  const a = { id: 'a', name: 'A' }
  const b = { id: 'b', name: 'B' }
  assert.deepEqual(requestCoverPeople({ coverPeople: [a, b], coverPerson: a }), [a, b])
  assert.deepEqual(requestCoverPeople({ coverPeople: [], coverPerson: b }), [b])
  assert.deepEqual(requestCoverPeople({}), [])
  assert.equal(requestDays(leave({ leaveDays: 1.5 })), 1.5)
  assert.equal(requestDays(leave({ isHalfDay: true, startDate: '2026-11-19T00:00:00.000Z', endDate: '2026-11-19T00:00:00.000Z' })), 0.5)
})

test('leave style reuses the shared type labels and tones', () => {
  for (const t of ['CASUAL', 'SICK', 'ANNUAL'] as const) {
    assert.equal(LEAVE_TYPE_STYLE[t].label, LEAVE_TYPE_LABEL[t])
    assert.equal(LEAVE_TYPE_STYLE[t].bar, LEAVE_TYPE_TONE[t].bar)
    assert.equal(LEAVE_TYPE_STYLE[t].dot, LEAVE_TYPE_TONE[t].dot)
    assert.equal(LEAVE_TYPE_STYLE[t].text, LEAVE_TYPE_TONE[t].text)
  }
  assert.equal(halfDaySessionLabel('FIRST_HALF'), 'First half')
  assert.equal(halfDaySessionLabel(null), 'Half day')
  assert.equal(halfDayWindowLabel('09:00', '13:00'), '09:00 - 13:00')
  assert.equal(halfDayWindowLabel(null, null), 'Unavailable hours not provided')
})
