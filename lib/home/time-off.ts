import { formatDateRange } from '@/lib/format-date'
import { formatDays } from '@/lib/format-count'
import { LEAVE_TYPE_LABEL, LEAVE_TYPE_ORDER } from '@/lib/leave-type-style'
import { dayKeyOf } from '@/lib/home/time'
import { OUT_STATUSES, PENDING_STATUSES, type LeaveTypeValue } from '@/lib/home/out-today'
import type { OwnLeaveRow } from '@/lib/home/needs-you-sources'

export interface BalanceInput {
  casualDays: number
  casualUsed: number
  sickDays: number
  sickUsed: number
  annualDays: number
  annualUsed: number
}

export interface TimeOffPart {
  type: LeaveTypeValue
  left: number
  total: number
}

export interface NextLeave {
  range: string
  type: LeaveTypeValue
  pending: boolean
}

const includes = (list: readonly string[], value: string): boolean => list.includes(value)

function numberText(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

function partsFor(balance: BalanceInput): TimeOffPart[] {
  const totals: Record<LeaveTypeValue, [number, number]> = {
    CASUAL: [balance.casualDays, balance.casualUsed],
    SICK: [balance.sickDays, balance.sickUsed],
    ANNUAL: [balance.annualDays, balance.annualUsed],
  }
  return LEAVE_TYPE_ORDER.map((type) => ({
    type,
    total: totals[type][0],
    left: Math.max(0, totals[type][0] - totals[type][1]),
  }))
}

function pickNextLeave(own: readonly OwnLeaveRow[], todayKey: string): NextLeave | null {
  const upcoming = own
    .filter((r) => includes(OUT_STATUSES, r.status) && dayKeyOf(r.endDate) >= todayKey)
    .sort((a, b) => dayKeyOf(a.startDate).localeCompare(dayKeyOf(b.startDate)))
  const next = upcoming[0]
  if (!next) return null
  return {
    range: formatDateRange(next.startDate, next.endDate),
    type: next.leaveType,
    pending: includes(PENDING_STATUSES, next.status),
  }
}

export function summariseTimeOff(
  balance: BalanceInput,
  own: readonly OwnLeaveRow[],
  todayKey: string
): { totalLeft: number; parts: TimeOffPart[]; partsPhrase: string; totalPhrase: string; nextLeave: NextLeave | null } {
  const parts = partsFor(balance)
  const totalLeft = parts.reduce((sum, p) => sum + p.left, 0)
  const partsPhrase = parts
    .map((p) => (p.left > 0 ? `${numberText(p.left)} ${LEAVE_TYPE_LABEL[p.type].toLowerCase()}` : `No ${LEAVE_TYPE_LABEL[p.type].toLowerCase()} left`))
    .join(' · ')
  return {
    totalLeft,
    parts,
    partsPhrase,
    totalPhrase: totalLeft > 0 ? `${formatDays(totalLeft)} left` : 'No days left',
    nextLeave: pickNextLeave(own, todayKey),
  }
}

export function nextLeavePhrase(next: NextLeave | null): string {
  if (!next) return 'No leave booked yet'
  const base = `Next: ${next.range}, ${LEAVE_TYPE_LABEL[next.type].toLowerCase()}`
  return next.pending ? `${base} (waiting for approval)` : base
}
