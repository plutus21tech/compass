import { formatDays } from '@/lib/format-count'
import { formatDateRange, localDayKey } from '@/lib/format-date'
import { LEAVE_TYPE_LABEL } from './request-form'
import { PENDING_STATUSES, requestDays } from './request-rules'
import { toDateKey, type LeaveBalance, type LeaveRequest, type LeaveType } from './types'

export interface BalanceCardModel {
  type: LeaveType
  label: string
  left: number
  total: number
  pendingDays: number
  /** Share of the allowance still left, 0..1. */
  fraction: number
  isEmpty: boolean
  note: string
}

export interface NextLeaveModel {
  type: LeaveType
  label: string
  range: string
  status: 'Approved' | 'Waiting for approval'
  requestId: string
}

const CARD_ORDER: readonly LeaveType[] = ['CASUAL', 'SICK', 'ANNUAL']
const TALK_TO_HR = 'Talk to HR if you need more'

const allowanceOf = (balance: LeaveBalance, type: LeaveType): { left: number; total: number } => {
  if (type === 'CASUAL') return { left: balance.remaining.casual, total: balance.casualDays }
  if (type === 'SICK') return { left: balance.remaining.sick, total: balance.sickDays }
  return { left: balance.remaining.annual, total: balance.annualDays }
}

const pendingDaysFor = (requests: LeaveRequest[], type: LeaveType, year: number): number =>
  requests
    .filter(
      (r) => r.leaveType === type && PENDING_STATUSES.has(r.status) && toDateKey(r.startDate).startsWith(`${year}-`)
    )
    .reduce((sum, r) => sum + requestDays(r), 0)

export function buildBalanceCards(
  balance: LeaveBalance,
  requests: LeaveRequest[],
  balanceYear: number
): BalanceCardModel[] {
  return CARD_ORDER.map((type) => {
    const { left, total } = allowanceOf(balance, type)
    const pendingDays = pendingDaysFor(requests, type, balanceYear)
    const isEmpty = left <= 0
    const fraction = total > 0 ? Math.min(1, Math.max(0, left / total)) : 0
    const note = isEmpty ? TALK_TO_HR : pendingDays > 0 ? `${formatDays(pendingDays)} pending` : 'Nothing pending'
    return { type, label: LEAVE_TYPE_LABEL[type], left, total, pendingDays, fraction, isEmpty, note }
  })
}

const UPCOMING_STATUSES: ReadonlySet<string> = new Set([...PENDING_STATUSES, 'APPROVED'])

/** The earliest own request, waiting or approved, whose last day is today or later. */
export function nextLeave(requests: LeaveRequest[], now: Date = new Date()): NextLeaveModel | null {
  const today = localDayKey(now)
  const upcoming = requests
    .filter((r) => UPCOMING_STATUSES.has(r.status) && toDateKey(r.endDate) >= today)
    .sort((a, b) => toDateKey(a.startDate).localeCompare(toDateKey(b.startDate)))
  const first = upcoming[0]
  if (!first) return null
  return {
    type: first.leaveType,
    label: LEAVE_TYPE_LABEL[first.leaveType],
    range: formatDateRange(first.startDate, first.endDate, { now }),
    status: first.status === 'APPROVED' ? 'Approved' : 'Waiting for approval',
    requestId: first.id,
  }
}
