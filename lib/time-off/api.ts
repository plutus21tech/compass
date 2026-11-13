import type { CalendarBirthday, CalendarHoliday } from '@/components/leave/CalendarDayMarkers'
import type { OutTodayView } from '@/lib/home/out-today'
import type { TransitionTask } from '@/lib/leave-transition-plan'
import type {
  ApprovalRequest, CalendarEvent, DirectoryUser, LeaveBalance, LeaveRequest, WfhRequest,
} from './types'

export type ApiResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string }

export interface TimeOffSnapshot {
  balance: LeaveBalance | null
  requests: LeaveRequest[]
  users: DirectoryUser[]
  approvals: ApprovalRequest[]
  wfhRequests: WfhRequest[]
  wfhApprovals: WfhRequest[]
}

export interface CalendarMonthData {
  events: CalendarEvent[]
  holidays: CalendarHoliday[]
  birthdays: CalendarBirthday[]
}

const LOAD_ERROR = 'Could not load your time off. Refresh to try again.'
const OUT_TODAY_ERROR = 'Could not load who is out today.'
const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** ok only when the HTTP call succeeded and the body does not say success:false. */
export async function readResult<T>(res: Response, fallback: string): Promise<ApiResult<T>> {
  let body: Record<string, unknown> | null = null
  try {
    const parsed: unknown = await res.json()
    body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return { ok: false, error: fallback }
  }
  if (!body) return { ok: false, error: fallback }
  if (res.ok && body.success !== false) return { ok: true, data: body as T }
  const error = typeof body.error === 'string' && body.error ? body.error : fallback
  return { ok: false, error }
}

export async function call<T>(url: string, init: RequestInit | undefined, fallback: string): Promise<ApiResult<T>> {
  try {
    return await readResult<T>(await fetch(url, init), fallback)
  } catch {
    return { ok: false, error: fallback }
  }
}

const send = (method: string, body?: unknown): RequestInit =>
  body === undefined ? { method } : { method, headers: JSON_HEADERS, body: JSON.stringify(body) }

type LeavePayload = Record<string, unknown>

export const submitLeave = (payload: LeavePayload) =>
  call<{ request?: { id: string } }>('/api/leave/requests', send('POST', payload), 'Failed to submit request')

export const updateLeave = (payload: LeavePayload) =>
  call('/api/leave/requests', send('PUT', payload), 'Failed to update leave request')

export const cancelLeave = (id: string) =>
  call(`/api/leave/requests?id=${encodeURIComponent(id)}`, send('DELETE'), 'Failed to cancel')

export const decideLeave = (requestId: string, action: 'approve' | 'reject') =>
  call<{ status?: string }>('/api/leave/approve', send('POST', { requestId, action }), 'Failed to process request')

const planUrl = (id: string) => `/api/leave/requests/${id}/transition-plan`

export const saveTransitionPlanDraft = (id: string, tasks: TransitionTask[]) =>
  call(planUrl(id), send('PUT', { tasks }), 'Failed to save draft')

export const submitTransitionPlan = (id: string, tasks: TransitionTask[]) =>
  call(planUrl(id), send('POST', { tasks }), 'Failed to submit transition plan')

export const reviewTransitionPlan = (id: string, action: 'APPROVE' | 'DISAPPROVE', reason: string) =>
  call(`${planUrl(id)}/review`, send('POST', { action, reason }), 'Failed to review transition plan')

export interface WfhSubmission {
  startDate: string
  endDate: string
  requestTimezone: string
  reason: string
  workPlan: string
}

export const submitWfh = (body: WfhSubmission) =>
  call(
    '/api/wfh/requests',
    send('POST', {
      startDate: body.startDate,
      endDate: body.endDate,
      requestTimezone: body.requestTimezone,
      reason: body.reason,
      workPlan: body.workPlan || undefined,
    }),
    'Failed to submit WFH request',
  )

export const cancelWfh = (id: string) =>
  call(`/api/wfh/requests?id=${encodeURIComponent(id)}`, send('DELETE'), 'Failed to cancel WFH request')

export const decideWfh = (requestId: string, action: 'approve' | 'reject') =>
  call('/api/wfh/approve', send('POST', { requestId, action }), 'Failed to process WFH request')

export async function loadTimeOff(): Promise<ApiResult<TimeOffSnapshot>> {
  const [balance, requests, users, approvals, wfhRequests, wfhApprovals] = await Promise.all([
    call<{ balance: LeaveBalance | null }>('/api/leave/balance', undefined, LOAD_ERROR),
    call<{ requests?: LeaveRequest[] }>('/api/leave/requests?employeeId=me', undefined, LOAD_ERROR),
    call<{ users?: DirectoryUser[] }>('/api/users', undefined, LOAD_ERROR),
    call<{ requests?: ApprovalRequest[] }>('/api/leave/requests?forApproval=true', undefined, LOAD_ERROR),
    call<{ requests?: WfhRequest[] }>('/api/wfh/requests?employeeId=me', undefined, LOAD_ERROR),
    call<{ requests?: WfhRequest[] }>('/api/wfh/requests?forApproval=true', undefined, LOAD_ERROR),
  ])
  if (!balance.ok || !requests.ok) return { ok: false, error: LOAD_ERROR }
  return {
    ok: true,
    data: {
      balance: balance.data.balance ?? null,
      requests: requests.data.requests ?? [],
      users: users.ok ? users.data.users ?? [] : [],
      approvals: approvals.ok ? approvals.data.requests ?? [] : [],
      wfhRequests: wfhRequests.ok ? wfhRequests.data.requests ?? [] : [],
      wfhApprovals: wfhApprovals.ok ? wfhApprovals.data.requests ?? [] : [],
    },
  }
}

export async function loadCalendarMonth(year: number, month: number): Promise<ApiResult<CalendarMonthData>> {
  const r = await call<Partial<CalendarMonthData>>(
    `/api/leave/calendar?month=${month}&year=${year}`,
    undefined,
    'Could not load the calendar.',
  )
  if (!r.ok) return r
  return {
    ok: true,
    data: { events: r.data.events ?? [], holidays: r.data.holidays ?? [], birthdays: r.data.birthdays ?? [] },
  }
}

const isOutPerson = (value: unknown): boolean =>
  value !== null && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string'

/** The `outToday` of a GET /api/home/overview body, or null when the body is not one. */
export function pickOutToday(body: unknown): OutTodayView | null {
  const data = body !== null && typeof body === 'object' ? (body as { data?: unknown }).data : undefined
  const out = data !== null && typeof data === 'object' ? (data as { outToday?: unknown }).outToday : undefined
  if (out === null || typeof out !== 'object') return null
  const { count, people } = out as { count?: unknown; people?: unknown }
  if (typeof count !== 'number' || !Array.isArray(people) || !people.every(isOutPerson)) return null
  return out as OutTodayView
}

/** Who is out today, from the same source and rule as Home (approved leave, Karachi day). */
export async function loadOutToday(): Promise<ApiResult<OutTodayView>> {
  const r = await call<unknown>('/api/home/overview', undefined, OUT_TODAY_ERROR)
  if (!r.ok) return r
  const out = pickOutToday(r.data)
  return out ? { ok: true, data: out } : { ok: false, error: OUT_TODAY_ERROR }
}
