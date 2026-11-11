// Bell rows that sit beside the leave, WFH and transition-plan emails. Never throws: a bell failure must not break a route.
import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'
import { formatDate, formatDateRange } from '@/lib/format-date'
import { getLeaveRequestPath } from '@/lib/leave-deep-links'
import { recordNotificationsSafely, type NewNotification } from '@/lib/notifications/service'

type Db = PrismaClient | Prisma.TransactionClient

export type LeaveNoticeEvent =
  | 'LEAVE_APPROVED'
  | 'LEAVE_REJECTED'
  | 'LEAVE_CANCELLED'
  | 'PLAN_REMINDER'
  | 'PLAN_DEADLINE_NOTICE'
  | 'PLAN_FINAL_WARNING'
  | 'PLAN_DISAPPROVED'
export type WfhNoticeEvent = 'WFH_APPROVED' | 'WFH_REJECTED'

export interface LeaveNoticeSubject {
  id: string
  employeeId: string
  leaveType: 'CASUAL' | 'SICK' | 'ANNUAL'
  isHalfDay: boolean
  startDate: Date
  endDate: Date
}

interface TitleOptions {
  deadline?: Date
  now?: Date
}

const LEAVE_TYPE_WORD = { CASUAL: 'casual', SICK: 'sick', ANNUAL: 'annual' } as const

/** "your annual leave, Thu 19 – Mon 23 Nov", or "your casual half day, Thu 19 Nov". */
function leavePhrase(leave: LeaveNoticeSubject, now?: Date): string {
  const type = LEAVE_TYPE_WORD[leave.leaveType]
  if (leave.isHalfDay) return `your ${type} half day, ${formatDate(leave.startDate, { now })}`
  return `your ${type} leave, ${formatDateRange(leave.startDate, leave.endDate, { now })}`
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function leaveNoticeTitle(event: LeaveNoticeEvent, leave: LeaveNoticeSubject, options: TitleOptions = {}): string {
  const phrase = leavePhrase(leave, options.now)
  const by = options.deadline ? formatDate(options.deadline, { now: options.now }) : ''
  switch (event) {
    case 'LEAVE_APPROVED':
      return `${capitalise(phrase)}, was approved`
    case 'LEAVE_REJECTED':
      return `${capitalise(phrase)}, was not approved`
    case 'LEAVE_CANCELLED':
      return `${capitalise(phrase)}, was cancelled`
    case 'PLAN_REMINDER':
      return `Add a transition plan for ${phrase}`
    case 'PLAN_DEADLINE_NOTICE':
      return `Add a transition plan by ${by} for ${phrase}`
    case 'PLAN_FINAL_WARNING':
      return `Last reminder: add a transition plan by ${by} or ${phrase}, will be cancelled`
    case 'PLAN_DISAPPROVED':
      return `Your lead sent back the transition plan for ${phrase}`
  }
}

export function wfhNoticeTitle(event: WfhNoticeEvent, wfh: { startDate: Date; endDate: Date }, options: { now?: Date } = {}): string {
  const range = formatDateRange(wfh.startDate, wfh.endDate, { now: options.now })
  const outcome = event === 'WFH_APPROVED' ? 'approved' : 'not approved'
  return `Your work-from-home request, ${range}, was ${outcome}`
}

/** The table's dedupe key is global, so each recipient gets their own copy of it. */
export function scopeDedupeKey(key: string | undefined, userId: string): string | undefined {
  return key === undefined ? undefined : `${key}:${userId}`
}

export interface LeaveNoticeOptions {
  deadline?: Date
  dedupeKey?: string
  link?: string
}

function leaveRow(leave: LeaveNoticeSubject, event: LeaveNoticeEvent, options: LeaveNoticeOptions): NewNotification {
  return {
    userId: leave.employeeId,
    kind: event,
    title: leaveNoticeTitle(event, leave, { deadline: options.deadline }),
    link: options.link ?? getLeaveRequestPath(leave.id),
    dedupeKey: scopeDedupeKey(options.dedupeKey, leave.employeeId),
  }
}

export async function notifyLeave(
  requestId: string,
  event: LeaveNoticeEvent,
  options: Omit<LeaveNoticeOptions, 'link'> = {},
  db: Db = prisma,
): Promise<void> {
  await recordNotificationsSafely(
    `leave ${event}`,
    async () => {
      const leave = await db.leaveRequest.findUnique({
        where: { id: requestId },
        select: { id: true, employeeId: true, leaveType: true, isHalfDay: true, startDate: true, endDate: true },
      })
      return leave ? [leaveRow(leave, event, options)] : []
    },
    db,
  )
}

export async function notifyLeaveFor(
  leave: LeaveNoticeSubject,
  event: LeaveNoticeEvent,
  options: LeaveNoticeOptions = {},
  db: Db = prisma,
): Promise<void> {
  await recordNotificationsSafely(`leave ${event}`, () => Promise.resolve([leaveRow(leave, event, options)]), db)
}

export async function notifyWfh(requestId: string, event: WfhNoticeEvent, db: Db = prisma): Promise<void> {
  await recordNotificationsSafely(
    `wfh ${event}`,
    async () => {
      const wfh = await db.wfhRequest.findUnique({
        where: { id: requestId },
        select: { employeeId: true, startDate: true, endDate: true },
      })
      if (!wfh) return []
      return [{ userId: wfh.employeeId, kind: event, title: wfhNoticeTitle(event, wfh), link: '/leave' }]
    },
    db,
  )
}
