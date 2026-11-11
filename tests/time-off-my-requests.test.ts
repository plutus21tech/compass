import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MyRequests } from '@/components/leave/time-off/MyRequests'
import { RequestDetailsBody } from '@/components/leave/time-off/RequestDetailsDialog'
import type { DirectoryUser, LeaveRequest } from '@/lib/time-off/types'

const day = (offset: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function req(o: Partial<LeaveRequest> = {}): LeaveRequest {
  return {
    id: 'r1',
    leaveType: 'CASUAL',
    isHalfDay: false,
    startDate: day(10),
    endDate: day(10),
    reason: 'Family event',
    transitionPlan: '',
    status: 'PENDING',
    createdAt: day(-1),
    ...o,
  }
}

const noop = () => {}
const list = (requests: LeaveRequest[]) =>
  renderToStaticMarkup(createElement(MyRequests, { requests, onView: noop, onEdit: noop, onCancel: noop }))

const users: DirectoryUser[] = [
  { id: 'u1', name: 'Sara Khan' },
  { id: 'u2', name: 'Omar Ali' },
  { id: 'u3', name: 'Nobody Listed' },
]
const body = (request: LeaveRequest) =>
  renderToStaticMarkup(
    createElement(RequestDetailsBody, { request, users, onEdit: noop, onCancel: noop, onClose: noop, onChanged: noop })
  )

test('card id and empty state', () => {
  const html = list([])
  assert.match(html, /id="my-requests"/)
  assert.match(html, /My requests/)
  assert.match(html, /No requests yet/)
  assert.match(html, /Drag across days on the calendar, or use Request leave\./)
})

test('a pending future request offers Edit and Cancel request', () => {
  const html = list([req()])
  assert.match(html, /View details/)
  assert.match(html, />Edit</)
  assert.match(html, /Cancel request/)
})

test('an approved request ending today offers neither', () => {
  const html = list([req({ status: 'APPROVED', startDate: day(-1), endDate: day(0) })])
  assert.match(html, /View details/)
  assert.doesNotMatch(html, />Edit</)
  assert.doesNotMatch(html, /Cancel request/)
})

test('a rejected request only offers View details', () => {
  const html = list([req({ status: 'REJECTED' })])
  assert.match(html, /View details/)
  assert.doesNotMatch(html, />Edit</)
  assert.doesNotMatch(html, /Cancel request/)
})

test('durations are in words, with the half-day window', () => {
  const half = list([
    req({ isHalfDay: true, halfDaySession: 'FIRST_HALF', unavailableStartTime: '09:00', unavailableEndTime: '13:00', leaveDays: 0.5 }),
  ])
  assert.match(half, /0\.5 days/)
  assert.match(half, /First half/)
  assert.match(half, /09:00 - 13:00/)
  // Thu 2026-11-12 to Mon 2026-11-16: back Tue 17 Nov
  const long = list([req({ startDate: '2026-11-12', endDate: '2026-11-16', leaveDays: 3 })])
  assert.match(long, /3 days/)
  assert.match(long, /Back .*17/)
  assert.doesNotMatch(long, /\d \/ \d/)
})

test('details show every field and additional notifications by name', () => {
  const html = body(
    req({
      coverPeople: [{ id: 'u2', name: 'Omar Ali' }],
      additionalNotifyIds: ['u1'],
      transitionPlanSubmittedAt: day(-1),
      transitionPlanLeadStatus: 'PENDING',
    })
  )
  for (const t of ['Family event', 'Additional notifications', 'Sara Khan', 'Omar Ali', 'Expected return', 'Duration', 'Reason']) {
    assert.ok(html.includes(t), t)
  }
  assert.doesNotMatch(html, /Nobody Listed/)
  assert.doesNotMatch(html, /\d \/ \d/)
})

test('a submitted plan awaiting the lead is read-only', () => {
  const html = body(req({ transitionPlanSubmittedAt: day(-1), transitionPlanLeadStatus: 'PENDING' }))
  assert.doesNotMatch(html, /Save draft/)
  assert.match(html, /Edit request/)
})

test('a disapproved plan is editable with the lead reason and Resubmit', () => {
  const html = body(
    req({
      transitionPlanSubmittedAt: day(-1),
      transitionPlanLeadStatus: 'DISAPPROVED',
      transitionPlanDisapprovalReason: 'Add the client handover',
    })
  )
  assert.match(html, /Team Lead asked for changes:/)
  assert.match(html, /Add the client handover/)
  assert.match(html, /Resubmit plan/)
  assert.match(html, /Save draft/)
})

test('an unsubmitted plan shows Submit transition plan', () => {
  assert.match(body(req()), /Submit transition plan/)
})
