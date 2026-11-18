import { formatDate } from '@/lib/format-date'
import { getNextBusinessDay, leaveDateKey } from '@/lib/leave-utils'
import { toDateKey, type CalendarEvent, type LeaveRequest } from './types'

type LeaveSpan = Pick<LeaveRequest, 'startDate' | 'endDate' | 'isHalfDay'>

/** The expected return day as a YYYY-MM-DD key: same day for a half day, else the next business day. */
export function returnDateKey(r: LeaveSpan): string {
  if (r.isHalfDay) return toDateKey(r.startDate)
  const key = toDateKey(r.endDate)
  if (!key) return ''
  return leaveDateKey(getNextBusinessDay(new Date(`${key}T00:00:00Z`)))
}

export function returnDateLabel(r: LeaveSpan): string {
  const key = returnDateKey(r)
  return key ? formatDate(key) : ''
}

/** People out on a day, soonest back first, then by name; the viewer stays on top. */
export function sortByReturn(events: readonly CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (a.isCurrentUser !== b.isCurrentUser) return a.isCurrentUser ? -1 : 1
    const byReturn = returnDateKey(a).localeCompare(returnDateKey(b))
    return byReturn !== 0 ? byReturn : a.employeeName.localeCompare(b.employeeName)
  })
}

const WAITING_STATUSES: ReadonlySet<string> = new Set(['PENDING', 'LEAD_APPROVED', 'HR_APPROVED'])

/** Still waiting for someone's approval. */
export function isWaiting(status: string): boolean {
  return WAITING_STATUSES.has(status)
}

/** Requests waiting for approval first (soonest start first), then everything else as history. */
export function splitRequests<T extends Pick<LeaveRequest, 'status' | 'startDate'>>(
  requests: readonly T[]
): { waiting: T[]; history: T[] } {
  const waiting = requests
    .filter((r) => isWaiting(r.status))
    .sort((a, b) => toDateKey(a.startDate).localeCompare(toDateKey(b.startDate)))
  const history = requests.filter((r) => !isWaiting(r.status))
  return { waiting, history }
}

export interface TrackerStep {
  label: 'Sent' | 'Lead' | 'HR'
  done: boolean
}

/** Where a waiting request stands: sent, then the lead's approval, then HR's. */
export function approvalTracker(status: string): TrackerStep[] {
  const approved = status === 'APPROVED'
  return [
    { label: 'Sent', done: true },
    { label: 'Lead', done: approved || status === 'LEAD_APPROVED' },
    { label: 'HR', done: approved || status === 'HR_APPROVED' },
  ]
}
