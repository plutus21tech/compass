import type { EvaluationsCardView } from '@/lib/weekly/service/dashboard-card'
import type { LateFormsResponse } from '@/lib/weekly/view-types'
import type { AssignedCardView } from '@/lib/academy/view'
import type { TaskListItem } from '@/lib/security-checks/service/task-views'
import type { HomeOverview, TeamUpcomingRow } from '@/lib/home/out-today'
import type { BalanceInput } from '@/lib/home/time-off'
import type { HomeProject, HomeTask } from '@/lib/home/my-work'
import type { NeedsYouItem } from '@/lib/home/needs-you'
import { sortNeedsYou } from '@/lib/home/needs-you'
import {
  weeklyItems,
  lateFormItems,
  academyItems,
  teamLeadFormItems,
  leaveApprovalItems,
  wfhApprovalItems,
  ownPlanItems,
  securityTaskItems,
  ticketItems,
  type PendingTeamLeadForm,
  type ApprovalLeaveRow,
  type ApprovalWfhRow,
  type OwnLeaveRow,
  type TicketRow,
} from '@/lib/home/needs-you-sources'

export type Source<T> = { ok: true; data: T } | { ok: false; status: number | null }

/** A source this role does not fetch (or that does not apply): never counts as a failure. */
export const NOT_LOADED: Source<never> = { ok: false, status: 404 }

export async function fetchSource<T>(
  url: string,
  pick: (body: unknown) => T | null,
  fetcher: typeof fetch = fetch
): Promise<Source<T>> {
  let status: number | null = null
  try {
    const res = await fetcher(url, { cache: 'no-store' })
    if (!res.ok) {
      status = res.status
    } else {
      const data = pick(await res.json())
      if (data !== null) return { ok: true, data }
    }
  } catch {
    status = null
  }
  if (status !== 404) console.error('[home] source failed', { url, status })
  return { ok: false, status }
}

export interface NeedsYouSources {
  card: Source<EvaluationsCardView | null>
  lateForms: Source<LateFormsResponse>
  academy: Source<AssignedCardView[]>
  teamLeadForms: Source<PendingTeamLeadForm[]>
  leaveApprovals: Source<ApprovalLeaveRow[]>
  wfhApprovals: Source<ApprovalWfhRow[]>
  ownLeave: Source<OwnLeaveRow[]>
  securityTasks: Source<TaskListItem[]>
  tickets: Source<TicketRow[]>
}

export function needsYouFromSources(
  s: NeedsYouSources,
  viewer: { role: string; department: string | null },
  todayKey: string
): { items: NeedsYouItem[]; incomplete: boolean } {
  const items: NeedsYouItem[] = []
  const add = <T,>(src: Source<T>, build: (data: T) => NeedsYouItem[]) => {
    if (src.ok) items.push(...build(src.data))
  }
  add(s.card, weeklyItems)
  add(s.lateForms, lateFormItems)
  add(s.academy, academyItems)
  add(s.teamLeadForms, teamLeadFormItems)
  add(s.leaveApprovals, (rows) => leaveApprovalItems(rows, viewer))
  add(s.wfhApprovals, (rows) => wfhApprovalItems(rows, viewer))
  add(s.ownLeave, (rows) => ownPlanItems(rows, viewer, todayKey))
  add(s.securityTasks, securityTaskItems)
  add(s.tickets, (rows) => ticketItems(rows, viewer.role))
  const all: Source<unknown>[] = Object.values(s)
  const incomplete = all.some((src) => !src.ok && src.status !== 404)
  return { items: sortNeedsYou(items), incomplete }
}

const field = (body: unknown, key: string): unknown =>
  body !== null && typeof body === 'object' ? (body as Record<string, unknown>)[key] : undefined
const arrayField = <T,>(key: string) => (body: unknown): T[] | null => {
  const value = field(body, key)
  return Array.isArray(value) ? (value as T[]) : null
}
const objectField = <T,>(key: string) => (body: unknown): T | null => {
  const value = field(body, key)
  return value !== null && typeof value === 'object' ? (value as T) : null
}

export interface SecurityMe { enabled: boolean; actionable?: number }

export const HOME_SOURCES = {
  card: {
    url: '/api/weekly/card',
    /** Wrapped so a legitimately empty card (null) is not mistaken for a bad body. */
    pick: (body: unknown): { card: EvaluationsCardView | null } | null => {
      const card = field(body, 'card')
      return card === undefined ? null : { card: card as EvaluationsCardView | null }
    },
  },
  lateForms: {
    url: '/api/weekly/late-forms',
    pick: (body: unknown): LateFormsResponse | null =>
      body !== null && typeof body === 'object' ? (body as LateFormsResponse) : null,
  },
  academy: { url: '/api/onboarding/academy/assigned', pick: arrayField<AssignedCardView>('data') },
  teamLeadForms: { url: '/api/onboarding/team-lead-forms/pending', pick: arrayField<PendingTeamLeadForm>('pending') },
  leaveApprovals: { url: '/api/leave/requests?forApproval=true', pick: arrayField<ApprovalLeaveRow>('requests') },
  wfhApprovals: { url: '/api/wfh/requests?forApproval=true', pick: arrayField<ApprovalWfhRow>('requests') },
  ownLeave: { url: '/api/leave/requests?employeeId=me', pick: arrayField<OwnLeaveRow>('requests') },
  securityMe: { url: '/api/security-checks/me', pick: objectField<SecurityMe>('data') },
  securityTasks: { url: '/api/security-checks/tasks', pick: arrayField<TaskListItem>('data') },
  tickets: { url: '/api/device-tickets', pick: arrayField<TicketRow>('tickets') },
  balance: { url: '/api/leave/balance', pick: objectField<BalanceInput>('balance') },
  teamUpcoming: { url: '/api/leave/requests?scope=team-upcoming', pick: arrayField<TeamUpcomingRow>('requests') },
  overview: { url: '/api/home/overview', pick: objectField<HomeOverview>('data') },
  tasks: { url: '/api/my-tasks?status=ACTIVE&sort=due_asc', pick: arrayField<HomeTask>('tasks') },
  projects: { url: '/api/projects', pick: arrayField<HomeProject>('projects') },
} as const
