import { localDayKey } from '@/lib/format-date'
import { transitionPlanRequired } from '@/lib/leave-transition-plan'
import { calculateLeaveDuration } from '@/lib/leave-utils'
import { hasWfhEnded } from '@/lib/wfh-utils'
import { toDateKey, type ApprovalRequest, type LeaveRequest, type WfhRequest } from './types'

export const PENDING_STATUSES: ReadonlySet<string> = new Set(['PENDING', 'LEAD_APPROVED', 'HR_APPROVED'])
export const EDITABLE_STATUSES: ReadonlySet<string> = PENDING_STATUSES
export const CANCELLABLE_STATUSES: ReadonlySet<string> = new Set([...PENDING_STATUSES, 'APPROVED'])

const MS_PER_DAY = 24 * 60 * 60 * 1000

export const canEditRequest = (r: Pick<LeaveRequest, 'status'>): boolean => EDITABLE_STATUSES.has(r.status)

/** A leave can be cancelled until the day before its last day. */
export const canCancelRequest = (r: Pick<LeaveRequest, 'status' | 'endDate'>, now: Date = new Date()): boolean =>
  CANCELLABLE_STATUSES.has(r.status) && toDateKey(r.endDate) > localDayKey(now)

export const canCancelWfhRequest = (r: Pick<WfhRequest, 'status' | 'endDate'>, now: Date = new Date()): boolean =>
  CANCELLABLE_STATUSES.has(r.status) && !hasWfhEnded(new Date(r.endDate), now)

/** True when the leave starts today or later; true too when the date cannot be read. */
export const isLeaveNotStarted = (startDate: string, now: Date = new Date()): boolean => {
  const key = toDateKey(startDate)
  if (!key) return true
  return key >= localDayKey(now)
}

export const requestCoverPeople = (
  r: Pick<LeaveRequest, 'coverPeople' | 'coverPerson'>
): Array<{ id: string; name: string }> =>
  Array.isArray(r.coverPeople) && r.coverPeople.length > 0 ? r.coverPeople : r.coverPerson ? [r.coverPerson] : []

export const requestDays = (
  r: Pick<LeaveRequest, 'leaveDays' | 'startDate' | 'endDate' | 'isHalfDay'>
): number => r.leaveDays ?? calculateLeaveDuration(new Date(r.startDate), new Date(r.endDate), r.isHalfDay)

/**
 * Whether the leave needs a transition plan. A lead's approval rows carry the
 * applicant; the user's own rows are judged by the viewer's department.
 */
export const planRequiredFor = (
  r: Pick<LeaveRequest, 'leaveType' | 'isHalfDay' | 'startDate' | 'endDate'> & Partial<Pick<ApprovalRequest, 'employee'>>,
  viewerDepartment: string | null | undefined
): boolean =>
  transitionPlanRequired({
    leaveType: r.leaveType,
    isHalfDay: r.isHalfDay,
    startDate: new Date(r.startDate),
    endDate: new Date(r.endDate),
    department: r.employee ? r.employee.department : viewerDepartment,
  })

export const planEditable = (
  r: Pick<LeaveRequest, 'status' | 'startDate' | 'transitionPlanSubmittedAt' | 'transitionPlanLeadStatus'>,
  now: Date = new Date()
): boolean => {
  const closed = r.status === 'REJECTED' || r.status === 'CANCELLED'
  const submitted = Boolean(r.transitionPlanSubmittedAt)
  const disapproved = r.transitionPlanLeadStatus === 'DISAPPROVED'
  return !closed && isLeaveNotStarted(r.startDate, now) && (!submitted || disapproved)
}

/** Whole local days from today to the given YYYY-MM-DD key; NaN when unreadable. */
const wholeDaysFromToday = (key: string, now: Date): number => {
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return Number.NaN
  const start = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((start - today) / MS_PER_DAY)
}

/** Own requests still without a required plan whose leave starts within 0-3 days. */
export const planReminderRequests = (
  requests: readonly LeaveRequest[],
  viewerDepartment: string | null | undefined,
  now: Date = new Date()
): LeaveRequest[] =>
  requests.filter((r) => {
    if (!EDITABLE_STATUSES.has(r.status) && r.status !== 'APPROVED') return false
    if (r.transitionPlanSubmittedAt) return false
    if (!planRequiredFor(r, viewerDepartment)) return false
    const diff = wholeDaysFromToday(toDateKey(r.startDate), now)
    return diff >= 0 && diff <= 3
  })

export type PlanReviewState = 'review' | 'approved' | 'missing' | 'not-needed'

export const planReviewState = (r: ApprovalRequest): PlanReviewState => {
  if (r.transitionPlanSubmittedAt) return r.transitionPlanLeadStatus === 'APPROVED' ? 'approved' : 'review'
  return planRequiredFor(r, null) ? 'missing' : 'not-needed'
}

export const approvalActions = (
  r: Pick<LeaveRequest, 'status'>
): { showApprove: boolean; reject: 'reject' | 'disapprove'; rejectLabel: 'Reject' | 'Disapprove' } =>
  r.status === 'APPROVED'
    ? { showApprove: false, reject: 'disapprove', rejectLabel: 'Disapprove' }
    : { showApprove: true, reject: 'reject', rejectLabel: 'Reject' }

export const decisionToast = (action: 'approve' | 'reject', resultStatus?: string): string =>
  action === 'approve' ? 'Leave approved' : resultStatus === 'CANCELLED' ? 'Leave cancelled' : 'Leave rejected'
