import { FYI_NOTICE_KINDS, type CardNoticeKind } from '@/lib/weekly/card-notice-kinds'
import type { EvaluationsCardView } from '@/lib/weekly/service/dashboard-card'
import type { LateFormsResponse } from '@/lib/weekly/view-types'
import type { AssignedCardView } from '@/lib/academy/view'
import type { TaskListItem } from '@/lib/security-checks/service/task-views'
import { transitionPlanRequired } from '@/lib/leave-transition-plan'
import { getLeaveRequestPath } from '@/lib/leave-deep-links'
import { isAdminRole } from '@/lib/permissions'
import { formatDateRange } from '@/lib/format-date'
import { formatCountOf } from '@/lib/format-count'
import { LEAVE_TYPE_LABEL } from '@/lib/leave-type-style'
import { dayKeyOf, karachiDayKey } from './time'
import type { LeaveTypeValue } from './out-today'
import type { NeedsYouItem } from './needs-you'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const labelOf = (type: LeaveTypeValue) => LEAVE_TYPE_LABEL[type].toLowerCase()
const earliest = (days: string[]) => days.reduce((a, b) => (b < a ? b : a))

const NOTICE_EYEBROW: Partial<Record<CardNoticeKind, string>> = {
  LIST_CHANGE_TO_REVIEW: 'Evaluation lists',
  PEER_CHANGE_ABOUT_YOU: 'Evaluation lists',
  HR_LIST_CHANGES: 'Evaluation lists',
  TEAM_SELF_REVIEW: 'Self-evaluation from your team',
  FORMS_OPEN: 'Quarter-end forms',
  HR_ANSWERS: 'Answers to review',
}

function noticeAction(kind: CardNoticeKind): string {
  if (kind === 'TEAM_SELF_REVIEW') return 'Read'
  if (kind === 'FORMS_OPEN') return 'Fill in'
  return 'Review'
}

export function weeklyItems(card: EvaluationsCardView | null): NeedsYouItem[] {
  if (!card) return []
  const items: NeedsYouItem[] = []
  const dueDay = card.dueAt ? karachiDayKey(new Date(card.dueAt)) : null
  if (card.state === 'CHECK_LISTS') {
    items.push({
      key: 'weekly:lists', source: 'weekly', eyebrow: 'Weekly evaluation', title: 'Check your evaluation lists',
      detail: null, dueDay, href: card.href, action: 'Check', prefetch: true,
    })
  } else if (card.state === 'THIS_WEEK') {
    const progress = card.counts ? `${formatCountOf(card.counts.done, card.counts.total)} done` : null
    const detail = [progress, card.detail].filter((part): part is string => Boolean(part)).join(' · ') || null
    items.push({
      key: 'weekly:week', source: 'weekly', eyebrow: 'Weekly evaluation', title: 'Answer this week’s questions',
      detail, dueDay, href: card.href, action: 'Answer', prefetch: true,
    })
  }
  if (card.selfReview) {
    items.push({
      key: 'self-review', source: 'self-review', eyebrow: 'Self-evaluation', title: card.selfReview,
      detail: null, dueDay: null, href: card.href, action: 'Write', prefetch: true,
    })
  }
  card.notices.forEach((notice, index) => {
    if (FYI_NOTICE_KINDS.has(notice.kind)) return
    items.push({
      key: `notice:${notice.kind}:${index}`,
      source: notice.kind === 'TEAM_SELF_REVIEW' ? 'self-review' : 'weekly',
      eyebrow: NOTICE_EYEBROW[notice.kind] ?? 'Weekly evaluation',
      title: notice.text, detail: null, dueDay: null, href: notice.href, action: noticeAction(notice.kind), prefetch: true,
    })
  })
  return items
}

export function lateFormItems(res: LateFormsResponse | null): NeedsYouItem[] {
  if (!res?.quarter || res.forms.length === 0) return []
  return [{
    key: 'late-forms', source: 'late-forms', eyebrow: 'Quarter-end forms', title: `Finish your ${res.quarter.name} evaluations`,
    detail: `${formatCountOf(res.total - res.forms.length, res.total)} done`, dueDay: null,
    href: '/evaluations/weekly', action: 'Finish', prefetch: true,
  }]
}

export function academyItems(items: readonly AssignedCardView[]): NeedsYouItem[] {
  return items.map((m) => {
    const lead = m.reread ? 'Please read this again' : 'HR asked you to read this'
    return {
      key: `academy:${m.slug}`, source: 'academy', eyebrow: 'Assigned by HR', title: m.title,
      detail: m.estimatedMinutes > 0 ? `${lead} · About ${m.estimatedMinutes} min` : lead,
      dueDay: null, href: `/onboarding/${m.slug}`, action: 'Read', prefetch: false,
    }
  })
}

export interface PendingTeamLeadForm { id: string; name: string; title: string; department: string | null; onboardingDate: string }

export function teamLeadFormItems(rows: readonly PendingTeamLeadForm[]): NeedsYouItem[] {
  return rows.map((r) => ({
    key: `team-lead-form:${r.id}`, source: 'team-lead-form', eyebrow: 'Onboarding form',
    title: `Fill in the onboarding form for ${r.name}`,
    detail: [r.title, r.department].filter(Boolean).join(' · ') || null,
    dueDay: dayKeyOf(r.onboardingDate), href: `/team-lead-form/${r.id}`, action: 'Fill in', prefetch: true,
  }))
}

export interface ApprovalLeaveRow {
  id: string
  leaveType: LeaveTypeValue
  status: string
  startDate: string
  endDate: string
  transitionPlanSubmittedAt?: string | null
  transitionPlanLeadStatus?: string | null
  employee: { id: string; name: string }
}

const planPending = (r: ApprovalLeaveRow) => Boolean(r.transitionPlanSubmittedAt) && r.transitionPlanLeadStatus === 'PENDING'

const waitingForHr = (r: ApprovalLeaveRow) => r.status === 'PENDING' || r.status === 'LEAD_APPROVED'

/**
 * HR sees one summary for the requests waiting on HR. HR who also lead a team still review their
 * team's handover plans: rows past HR's queue (only lead-queue rows) with a pending plan get their own item.
 */
function hrLeaveItems(rows: readonly ApprovalLeaveRow[]): NeedsYouItem[] {
  const waiting = rows.filter(waitingForHr)
  const summary: NeedsYouItem[] = waiting.length === 0 ? [] : [{
    key: 'leave:hr', source: 'leave-approval', eyebrow: 'Leave requests',
    title: `${plural(waiting.length, 'leave request', 'leave requests')} waiting for HR`, detail: null,
    dueDay: earliest(waiting.map((r) => dayKeyOf(r.startDate))), href: '/admin/leave', action: 'Review', prefetch: true,
  }]
  // HR_APPROVED rows are the viewer's own lead-queue rows still needing their decision as lead.
  const own: NeedsYouItem[] = rows.flatMap((r) => {
    if (waitingForHr(r)) return []
    const item = r.status === 'HR_APPROVED' || planPending(r) ? leadLeaveItem(r) : null
    return item ? [item] : []
  })
  return [...summary, ...own]
}

/** One per-request item for a lead: a decision (PENDING/HR_APPROVED, plan folded in) or a plan review. */
function leadLeaveItem(r: ApprovalLeaveRow): NeedsYouItem | null {
  const needsDecision = r.status === 'PENDING' || r.status === 'HR_APPROVED'
  const plan = planPending(r)
  if (!needsDecision && !plan) return null
  const range = formatDateRange(r.startDate, r.endDate)
  return {
    key: `leave:${r.id}`, source: 'leave-approval',
    eyebrow: needsDecision ? 'Leave requests' : 'Handover plan',
    title: needsDecision ? `Approve ${r.employee.name}’s ${labelOf(r.leaveType)} leave` : `Review ${r.employee.name}’s handover plan`,
    detail: needsDecision && plan ? `${range} · Handover plan to review too` : range,
    dueDay: dayKeyOf(r.startDate), href: getLeaveRequestPath(r.id), action: 'Review', prefetch: true,
  }
}

export function leaveApprovalItems(rows: readonly ApprovalLeaveRow[], viewer: { role: string }): NeedsYouItem[] {
  if (isAdminRole(viewer.role)) return hrLeaveItems(rows)
  return rows.flatMap((r) => {
    const item = leadLeaveItem(r)
    return item ? [item] : []
  })
}

export interface ApprovalWfhRow { id: string; status: string; startDate: string; endDate: string; employee: { name: string } }

export function wfhApprovalItems(rows: readonly ApprovalWfhRow[], viewer: { role: string }): NeedsYouItem[] {
  if (isAdminRole(viewer.role)) {
    const waiting = rows.filter((r) => r.status === 'PENDING' || r.status === 'LEAD_APPROVED')
    if (waiting.length === 0) return []
    return [{
      key: 'wfh:hr', source: 'wfh-approval', eyebrow: 'Work from home',
      title: `${plural(waiting.length, 'WFH request', 'WFH requests')} waiting for HR`, detail: null,
      dueDay: earliest(waiting.map((r) => dayKeyOf(r.startDate))), href: '/admin/leave', action: 'Review', prefetch: true,
    }]
  }
  return rows
    .filter((r) => r.status === 'PENDING' || r.status === 'HR_APPROVED')
    .map((r) => ({
      key: `wfh:${r.id}`, source: 'wfh-approval' as const, eyebrow: 'Work from home',
      title: `Approve ${r.employee.name}’s work from home`, detail: formatDateRange(r.startDate, r.endDate),
      dueDay: dayKeyOf(r.startDate), href: '/leave', action: 'Review', prefetch: true,
    }))
}

export interface OwnLeaveRow {
  id: string
  leaveType: LeaveTypeValue
  status: string
  isHalfDay: boolean
  startDate: string
  endDate: string
  transitionPlanSubmittedAt?: string | null
  transitionPlanLeadStatus?: string | null
}

const OWN_PLAN_STATUSES = ['PENDING', 'LEAD_APPROVED', 'HR_APPROVED', 'APPROVED']

export function ownPlanItems(rows: readonly OwnLeaveRow[], viewer: { department: string | null }, todayKey: string): NeedsYouItem[] {
  const items: NeedsYouItem[] = []
  for (const r of rows) {
    if (!OWN_PLAN_STATUSES.includes(r.status)) continue
    const start = dayKeyOf(r.startDate)
    if (start < todayKey) continue
    const disapproved = Boolean(r.transitionPlanSubmittedAt) && r.transitionPlanLeadStatus === 'DISAPPROVED'
    if (r.transitionPlanSubmittedAt && !disapproved) continue
    const required = transitionPlanRequired({
      leaveType: r.leaveType, isHalfDay: r.isHalfDay, startDate: new Date(r.startDate), endDate: new Date(r.endDate),
      department: viewer.department,
    })
    if (!required) continue
    items.push({
      key: `plan:${r.id}`, source: 'own-plan', eyebrow: 'Your leave',
      title: `${disapproved ? 'Update your' : 'Add a'} handover plan for your ${labelOf(r.leaveType)} leave`,
      detail: formatDateRange(r.startDate, r.endDate), dueDay: start, href: getLeaveRequestPath(r.id),
      action: disapproved ? 'Update plan' : 'Add plan', prefetch: true,
    })
  }
  return items
}

type SecurityTaskRow = Pick<TaskListItem, 'id' | 'campaignName' | 'statusLabel' | 'deadline' | 'resubmitDueAt' | 'needsAction'>

export function securityTaskItems(tasks: readonly SecurityTaskRow[]): NeedsYouItem[] {
  return tasks.filter((t) => t.needsAction).map((t) => ({
    key: `security:${t.id}`, source: 'security-check' as const, eyebrow: 'Security check', title: t.campaignName,
    detail: t.statusLabel, dueDay: karachiDayKey(new Date(t.resubmitDueAt ?? t.deadline)),
    href: `/security-checks/${t.id}`, action: 'Open', prefetch: true,
  }))
}

export interface TicketRow { id: string; title: string; status: string; createdAt: string }

export function ticketItems(tickets: readonly TicketRow[], role: string): NeedsYouItem[] {
  if (role !== 'HR' && role !== 'SECURITY') return []
  const open = tickets.filter((t) => t.status === 'OPEN' || t.status === 'UNDER_REVIEW')
  if (open.length === 0) return []
  const newest = open.reduce((a, b) => (Date.parse(b.createdAt) > Date.parse(a.createdAt) ? b : a))
  return [{
    key: 'tickets', source: 'tickets', eyebrow: 'Device support',
    title: `${plural(open.length, 'open device ticket', 'open device tickets')}`, detail: newest.title, dueDay: null,
    href: role === 'SECURITY' ? '/security/device-tickets' : '/admin/device-tickets', action: 'Manage', prefetch: true,
  }]
}
