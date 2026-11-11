import { calculateLeaveDuration, getNextBusinessDay, isWeekendDate, leaveDateKey } from '@/lib/leave-utils'

export interface LeaveSummaryInput {
  startDate: string
  endDate: string
  isHalfDay: boolean
  holidayKeys: ReadonlySet<string>
  remaining: number | null
  total: number | null
  balanceYear: number
}

export type SummaryProblem = 'missing-dates' | 'end-before-start' | 'too-long' | 'no-working-days'

export interface LeaveSummary {
  problem: SummaryProblem | null
  workingDays: number
  weekendDays: number
  holidayDays: number
  startKey: string
  endKey: string
  returnKey: string | null
  sameDayReturn: boolean
  balanceAfter: number | null
  otherYear: boolean
  overBalance: boolean
}

const MAX_RANGE_DAYS = 366
const MS_PER_DAY = 24 * 60 * 60 * 1000
const KEY = /^(\d{4})-(\d{2})-(\d{2})$/

/** A UTC-midnight date from a YYYY-MM-DD key; null when unreadable. */
function fromKey(key: string): Date | null {
  const m = KEY.exec(key)
  if (!m) return null
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

const EMPTY: LeaveSummary = {
  problem: null, workingDays: 0, weekendDays: 0, holidayDays: 0, startKey: '', endKey: '',
  returnKey: null, sameDayReturn: false, balanceAfter: null, otherYear: false, overBalance: false,
}

function countRange(start: Date, end: Date, holidays: ReadonlySet<string>): { weekend: number; holiday: number } {
  let weekend = 0
  let holiday = 0
  for (let t = start.getTime(); t <= end.getTime(); t += MS_PER_DAY) {
    const day = new Date(t)
    if (isWeekendDate(day)) weekend++
    else if (holidays.has(leaveDateKey(day))) holiday++
  }
  return { weekend, holiday }
}

export function summarizeLeaveRequest(input: LeaveSummaryInput): LeaveSummary {
  const start = fromKey(input.startDate)
  const rawEnd = input.isHalfDay ? start : fromKey(input.endDate)
  if (!start || !rawEnd) return { ...EMPTY, problem: 'missing-dates', startKey: input.startDate, endKey: input.endDate }

  const end = input.isHalfDay ? start : rawEnd
  const startKey = leaveDateKey(start)
  const endKey = leaveDateKey(end)
  const base: LeaveSummary = { ...EMPTY, startKey, endKey }

  if (end.getTime() < start.getTime()) return { ...base, problem: 'end-before-start' }
  if ((end.getTime() - start.getTime()) / MS_PER_DAY + 1 > MAX_RANGE_DAYS) return { ...base, problem: 'too-long' }

  const workingDays = calculateLeaveDuration(start, end, input.isHalfDay, input.holidayKeys)
  const { weekend, holiday } = countRange(start, end, input.holidayKeys)
  const returnKey = input.isHalfDay ? startKey : leaveDateKey(getNextBusinessDay(end))
  const sameYear = Number(startKey.slice(0, 4)) === input.balanceYear
  const balanceAfter = sameYear && input.remaining !== null ? input.remaining - workingDays : null

  return {
    problem: workingDays === 0 ? 'no-working-days' : null,
    workingDays,
    weekendDays: weekend,
    holidayDays: holiday,
    startKey,
    endKey,
    returnKey,
    sameDayReturn: input.isHalfDay,
    balanceAfter,
    otherYear: !sameYear,
    overBalance: balanceAfter !== null && balanceAfter < 0,
  }
}
