import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Source checks: each bell write sits after its state change, beside the email, and goes through the safe helpers.
const read = (file: string) => readFileSync(join(__dirname, '..', file), 'utf8')

interface WritePoint {
  file: string
  call: string
  anchor: string
  from?: string
}

const POINTS: WritePoint[] = [
  { file: 'app/api/leave/approve/route.ts', call: "await notifyLeave(requestId, 'LEAVE_CANCELLED')", anchor: 'sendLeaveCancellationNotification(requestId, user.name, comment)' },
  { file: 'app/api/leave/approve/route.ts', call: "await notifyLeave(requestId, 'LEAVE_REJECTED')", anchor: "sendLeaveApprovalNotification(requestId, 'rejected'" },
  { file: 'app/api/leave/approve/route.ts', call: "await notifyLeave(requestId, 'LEAVE_APPROVED')", anchor: "sendLeaveApprovalNotification(requestId, 'approved'" },
  { file: 'app/api/leave/requests/route.ts', call: "await notifyLeaveFor(leaveRequest, 'LEAVE_CANCELLED', { link: '/leave' })", anchor: 'removeLeaveCalendarEvent(requestId)', from: 'const active = leaveRequest.status' },
  { file: 'lib/leave-auto-cancel.ts', call: 'await notifyLeave(requestId, \'LEAVE_CANCELLED\', { dedupeKey: `leave-auto-cancel:${requestId}` })', anchor: 'sendLeaveCancellationNotification(requestId, AUTOMATED_ACTOR_LABEL, reason)' },
  { file: 'app/api/leave/requests/[id]/transition-plan/review/route.ts', call: "await notifyLeave(id, 'PLAN_DISAPPROVED')", anchor: 'sendTransitionPlanDisapprovedNotification(id, reason)' },
  { file: 'lib/leave-transition-plan-job.ts', call: 'await notifyLeave(requestId, \'PLAN_REMINDER\', { dedupeKey: `plan-reminder:${requestId}:${today.toISOString().slice(0, 10)}` })', anchor: 'sendTransitionPlanReminderNotification(requestId)' },
  { file: 'lib/leave-transition-plan-job.ts', call: "await notifyLeave(id, 'PLAN_DEADLINE_NOTICE', { deadline, dedupeKey: `plan-notice:${id}` })", anchor: 'sendTransitionPlanDeadlineNotice(id, deadline)' },
  { file: 'lib/leave-transition-plan-job.ts', call: "await notifyLeave(id, 'PLAN_FINAL_WARNING', { deadline, dedupeKey: `plan-final-warning:${id}` })", anchor: 'sendTransitionPlanFinalWarning(id, deadline)' },
  { file: 'app/api/wfh/approve/route.ts', call: "await notifyWfh(requestId, 'WFH_REJECTED')", anchor: "sendWfhApprovalNotification(requestId, 'rejected'" },
  { file: 'app/api/wfh/approve/route.ts', call: "await notifyWfh(requestId, 'WFH_APPROVED')", anchor: "sendWfhApprovalNotification(requestId, 'approved'" },
  { file: 'app/api/wfh/requests/route.ts', call: "await notifyWfh(wfhRequest.id, 'WFH_APPROVED')", anchor: "'Entered by HR on behalf of employee'" },
]

for (const point of POINTS) {
  test(`${point.file}: ${point.call.slice(6, 60)} follows its anchor`, () => {
    const source = read(point.file)
    const call = source.indexOf(point.call)
    assert.notEqual(call, -1, 'call is present')
    const base = point.from ? source.indexOf(point.from) : 0
    assert.notEqual(base, -1, 'branch start is present')
    const anchor = source.indexOf(point.anchor, base)
    assert.notEqual(anchor, -1, 'anchor is present')
    assert.ok(call > anchor, 'call comes after the anchor')
  })
}

test('transition-plan bell rows are written whenever the job acts, not only when the email succeeded', () => {
  const source = read('lib/leave-transition-plan-job.ts')
  for (const point of POINTS.filter((p) => p.file === 'lib/leave-transition-plan-job.ts')) {
    const anchor = source.indexOf(point.anchor)
    const call = source.indexOf(point.call)
    assert.doesNotMatch(source.slice(anchor, call), /if \(outcome\.success\)/, point.call)
  }
})

test('write points use only the safe notify helpers, never recordNotifications', () => {
  for (const file of new Set(POINTS.map((p) => p.file))) {
    assert.doesNotMatch(read(file), /recordNotifications/, file)
  }
})

test('the HR delete only notifies a request that was active and is not the HR user own', () => {
  const source = read('app/api/leave/requests/route.ts')
  assert.match(source, /if \(active && leaveRequest\.employeeId !== user\.id\) \{\s*await notifyLeaveFor\(/)
})
