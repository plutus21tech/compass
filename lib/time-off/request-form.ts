import { formatDays } from '@/lib/format-count'
import { LEAVE_TYPE_LABEL } from '@/lib/leave-type-style'
import {
  MAX_TRANSITION_TASKS,
  validateTransitionTasks,
  type TransitionTask,
} from '@/lib/leave-transition-plan'
import { requestCoverPeople } from './request-rules'
import type { LeaveSummary } from './request-summary'
import { toDateKey, type HalfDaySession, type LeaveRequest, type LeaveType } from './types'

export { LEAVE_TYPE_LABEL } from '@/lib/leave-type-style'

export interface RequestForm {
  leaveType: LeaveType
  isHalfDay: boolean
  halfDaySession: '' | HalfDaySession
  unavailableStartTime: string
  unavailableEndTime: string
  startDate: string
  endDate: string
  reason: string
  transitionPlan: string
  tasks: TransitionTask[]
  coverPersonIds: string[]
  additionalNotifyIds: string[]
}

export const EMPTY_REQUEST_FORM: RequestForm = {
  leaveType: 'CASUAL',
  isHalfDay: false,
  halfDaySession: '',
  unavailableStartTime: '',
  unavailableEndTime: '',
  startDate: '',
  endDate: '',
  reason: '',
  transitionPlan: '',
  tasks: [],
  coverPersonIds: [],
  additionalNotifyIds: [],
}

const SESSION_TIMES: Record<HalfDaySession, { start: string; end: string }> = {
  FIRST_HALF: { start: '09:00', end: '13:00' },
  SECOND_HALF: { start: '14:00', end: '18:00' },
}

const MAX_REASON = 4000
const MAX_NOTES = 6000
const MAX_COVER = 10
const MAX_NOTIFY = 20

export const isHalfDayEligible = (type: LeaveType): boolean => type === 'CASUAL' || type === 'SICK'

const clearedHalfDay = { halfDaySession: '' as const, unavailableStartTime: '', unavailableEndTime: '' }

export function withLeaveType(form: RequestForm, type: LeaveType): RequestForm {
  if (isHalfDayEligible(type)) return { ...form, leaveType: type }
  return { ...form, leaveType: type, isHalfDay: false, ...clearedHalfDay }
}

export function withHalfDay(form: RequestForm, on: boolean): RequestForm {
  if (on) return { ...form, isHalfDay: true, endDate: form.startDate ? form.startDate : form.endDate }
  return { ...form, isHalfDay: false, ...clearedHalfDay }
}

export function withSession(form: RequestForm, session: HalfDaySession): RequestForm {
  const times = SESSION_TIMES[session]
  return {
    ...form,
    halfDaySession: session,
    unavailableStartTime: form.unavailableStartTime || times.start,
    unavailableEndTime: form.unavailableEndTime || times.end,
  }
}

export function withDates(form: RequestForm, start: string, end: string): RequestForm {
  return { ...form, startDate: start, endDate: form.isHalfDay ? start : end }
}

export function formFromRequest(r: LeaveRequest): RequestForm {
  let tasks: TransitionTask[] = []
  try {
    tasks = validateTransitionTasks(r.transitionPlanTasks ?? [])
  } catch {
    tasks = []
  }
  return {
    leaveType: r.leaveType,
    isHalfDay: r.isHalfDay,
    halfDaySession: r.halfDaySession || '',
    unavailableStartTime: r.unavailableStartTime || '',
    unavailableEndTime: r.unavailableEndTime || '',
    startDate: toDateKey(r.startDate),
    endDate: toDateKey(r.endDate),
    reason: r.reason || '',
    transitionPlan: r.transitionPlan || '',
    tasks,
    coverPersonIds: requestCoverPeople(r).map((p) => p.id),
    additionalNotifyIds: Array.isArray(r.additionalNotifyIds) ? [...r.additionalNotifyIds] : [],
  }
}

export function isFormDirty(form: RequestForm): boolean {
  const e = EMPTY_REQUEST_FORM
  return (
    form.leaveType !== e.leaveType ||
    form.isHalfDay !== e.isHalfDay ||
    form.halfDaySession !== e.halfDaySession ||
    form.unavailableStartTime !== e.unavailableStartTime ||
    form.unavailableEndTime !== e.unavailableEndTime ||
    form.startDate !== e.startDate ||
    form.endDate !== e.endDate ||
    form.reason !== e.reason ||
    form.transitionPlan !== e.transitionPlan ||
    form.tasks.length > 0 ||
    form.coverPersonIds.length > 0 ||
    form.additionalNotifyIds.length > 0
  )
}

/** Half-day checks as the leave page runs them today; null when not a half day. */
export function halfDayError(form: RequestForm): string | null {
  if (!form.isHalfDay || !isHalfDayEligible(form.leaveType)) return null
  if (!form.halfDaySession) return 'Select first half or second half'
  if (!form.unavailableStartTime || !form.unavailableEndTime) {
    return 'Enter unavailable start and end time for half-day leave'
  }
  if (form.unavailableStartTime >= form.unavailableEndTime) return 'Unavailable end time must be after start time'
  return null
}

export type RequestStep = 1 | 2 | 3

function stepOneError(form: RequestForm, summary: LeaveSummary): string | null {
  if (!form.startDate) return 'Pick your first day off'
  if (!form.isHalfDay && !form.endDate) return 'Pick your last day off'
  if (summary.problem === 'end-before-start') return 'Your last day off is before your first day off'
  const half = halfDayError(form)
  if (half) return half
  if (summary.problem === 'too-long') return 'Pick a shorter range'
  if (summary.problem === 'no-working-days') return 'These dates have no working days to take off'
  if (summary.overBalance && summary.balanceAfter !== null) {
    const left = formatDays(summary.balanceAfter + summary.workingDays)
    return `You have ${left} of ${LEAVE_TYPE_LABEL[form.leaveType].toLowerCase()} leave left.`
  }
  if (form.reason.trim().length === 0) return 'Add a reason'
  if (form.reason.length > MAX_REASON) return 'Keep the reason under 4,000 characters'
  return null
}

export function stepError(step: RequestStep, form: RequestForm, summary: LeaveSummary): string | null {
  if (step === 1) return stepOneError(form, summary)
  if (step === 2) {
    if (form.transitionPlan.length > MAX_NOTES) return 'Keep handover notes under 6,000 characters'
    if (form.tasks.length > MAX_TRANSITION_TASKS) return `A plan can have up to ${MAX_TRANSITION_TASKS} tasks`
    return null
  }
  if (form.coverPersonIds.length > MAX_COVER) return 'Choose up to 10 cover people'
  if (form.additionalNotifyIds.length > MAX_NOTIFY) return 'Choose up to 20 people to notify'
  return null
}

function effectiveHalfDay(form: RequestForm): boolean {
  return form.isHalfDay && isHalfDayEligible(form.leaveType)
}

/** The POST body the leave page sends today. */
export function toLeavePayload(form: RequestForm, timeZone: string) {
  const isHalfDay = effectiveHalfDay(form)
  return {
    leaveType: form.leaveType,
    startDate: form.startDate,
    endDate: isHalfDay ? form.startDate : form.endDate,
    isHalfDay,
    requestTimezone: timeZone,
    halfDaySession: isHalfDay ? form.halfDaySession : undefined,
    unavailableStartTime: isHalfDay ? form.unavailableStartTime : undefined,
    unavailableEndTime: isHalfDay ? form.unavailableEndTime : undefined,
    reason: form.reason,
    transitionPlan: form.transitionPlan || undefined,
    coverPersonIds: form.coverPersonIds,
    additionalNotifyIds: form.additionalNotifyIds,
  }
}

/** The PUT body the leave page sends today. */
export function toLeaveUpdatePayload(id: string, form: RequestForm, timeZone: string) {
  const isHalfDay = effectiveHalfDay(form)
  return {
    id,
    leaveType: form.leaveType,
    isHalfDay,
    requestTimezone: timeZone,
    halfDaySession: isHalfDay ? form.halfDaySession : undefined,
    unavailableStartTime: isHalfDay ? form.unavailableStartTime : undefined,
    unavailableEndTime: isHalfDay ? form.unavailableEndTime : undefined,
    startDate: form.startDate,
    endDate: isHalfDay ? form.startDate : form.endDate,
    reason: form.reason,
    transitionPlan: form.transitionPlan || undefined,
    coverPersonIds: form.coverPersonIds,
    additionalNotifyIds: form.additionalNotifyIds,
  }
}
