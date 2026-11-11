import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ApprovalQueue } from '@/components/leave/time-off/ApprovalQueue'
import { OutTodayCard } from '@/components/leave/time-off/OutTodayCard'
import { PlanDisapproveForm } from '@/components/leave/time-off/PlanDisapproveDialog'
import type { ApprovalRequest, CalendarEvent } from '@/lib/time-off/types'

const day = (offset: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function approval(o: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'lr1',
    leaveType: 'CASUAL',
    isHalfDay: false,
    startDate: day(10),
    endDate: day(10),
    leaveDays: 1,
    reason: 'Family event',
    transitionPlan: '',
    status: 'PENDING',
    createdAt: day(-1),
    employee: { id: 'e1', name: 'Sara Khan', department: 'Design', position: null },
    ...o,
  }
}

const noop = async () => {}
const queue = (requests: ApprovalRequest[], highlightedId = '') =>
  renderToStaticMarkup(createElement(ApprovalQueue, { requests, highlightedId, onChanged: noop }))

test('empty queue renders nothing', () => {
  assert.equal(queue([]), '')
})

test('highlighted row carries id, aria-current and the email note', () => {
  const html = queue([approval()], 'lr1')
  assert.match(html, /id="leave-approval-lr1"/)
  assert.match(html, /aria-current="true"/)
  assert.match(html, /Opened from email/)
  assert.match(html, /Team approvals/)
  assert.match(html, /Sara Khan/)
})

test('a row that is not highlighted has no email note', () => {
  const html = queue([approval()], 'other')
  assert.doesNotMatch(html, /Opened from email/)
  assert.doesNotMatch(html, /aria-current/)
})

test('APPROVED row offers Disapprove and no Approve', () => {
  const html = queue([approval({ status: 'APPROVED' })])
  assert.match(html, />Disapprove</)
  assert.doesNotMatch(html, />Approve</)
})

test('pending row offers Approve and Reject', () => {
  const html = queue([approval()])
  assert.match(html, />Approve</)
  assert.match(html, />Reject</)
})

test('submitted plan awaiting review shows both plan buttons', () => {
  const html = queue([
    approval({ transitionPlanSubmittedAt: day(-1), transitionPlanLeadStatus: 'PENDING', transitionPlan: 'Cover my tickets' }),
  ])
  assert.match(html, /Approve plan/)
  assert.match(html, /Disapprove plan/)
})

test('approved plan is view only', () => {
  const html = queue([
    approval({ transitionPlanSubmittedAt: day(-1), transitionPlanLeadStatus: 'APPROVED', transitionPlan: 'Cover my tickets' }),
  ])
  assert.doesNotMatch(html, /Approve plan/)
  assert.doesNotMatch(html, /Disapprove plan/)
})

test('not-needed plan copy for a half day', () => {
  assert.match(queue([approval({ isHalfDay: true, halfDaySession: 'FIRST_HALF' })]), /No transition plan needed for this leave\./)
})

test('missing plan copy for a full day leave', () => {
  assert.match(queue([approval()]), /No transition plan submitted yet\./)
})

test('half day line is shown for a half day', () => {
  const html = queue([
    approval({ isHalfDay: true, halfDaySession: 'FIRST_HALF', unavailableStartTime: '09:00', unavailableEndTime: '13:00' }),
  ])
  assert.match(html, /First half - 09:00 - 13:00/)
})

test('PlanDisapproveForm disables Send back while the reason is empty', () => {
  const html = renderToStaticMarkup(
    createElement(PlanDisapproveForm, { onCancel: () => {}, onSubmit: noop }),
  )
  assert.match(html, /What should change\?/)
  assert.match(html, /id="plan-disapprove-reason"/)
  assert.match(html, /<button[^>]*disabled=""[^>]*>Send back<\/button>/)
})

const event = (o: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'ev1',
  employeeId: 'e2',
  employeeName: 'Omar Ali',
  department: null,
  leaveType: 'ANNUAL',
  isHalfDay: true,
  halfDaySession: 'FIRST_HALF',
  startDate: day(0),
  endDate: day(0),
  status: 'APPROVED',
  isCurrentUser: false,
  ...o,
})

test('OutTodayCard shows type and half-day session', () => {
  const html = renderToStaticMarkup(createElement(OutTodayCard, { events: [event()] }))
  assert.match(html, /Out today/)
  assert.match(html, /Omar Ali/)
  assert.match(html, /\(Annual, First half\)/)
})

test('OutTodayCard renders nothing when empty', () => {
  assert.equal(renderToStaticMarkup(createElement(OutTodayCard, { events: [] })), '')
})
