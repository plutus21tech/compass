function toUtcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function isWeekendDate(date: Date) {
  const day = date.getUTCDay()
  return day === 0 || day === 6
}

// Next business day strictly after `date`, skipping Saturdays and Sundays (UTC).
export function getNextBusinessDay(date: Date): Date {
  const next = toUtcDateOnly(date)
  do {
    next.setUTCDate(next.getUTCDate() + 1)
  } while (isWeekendDate(next))
  return next
}

// Expected return date after a leave ends: the next business day after the last
// day off, so a leave ending on a Friday returns on the following Monday.
export function getExpectedReturnDate(endDate: Date): Date {
  return getNextBusinessDay(endDate)
}

/** A UTC calendar day as "YYYY-MM-DD" -- the key holiday sets are matched on. */
export function leaveDateKey(date: Date): string {
  return toUtcDateOnly(date).toISOString().slice(0, 10)
}

/**
 * Days that are not charged as leave even though they fall Mon-Fri: the leave-calendar
 * holidays that apply to the person (lib/leave-holidays.ts). Keys are leaveDateKey values.
 * Optional everywhere so callers that do not deal in balances keep the weekday-only count.
 */
export type LeaveHolidayKeys = ReadonlySet<string>

const NO_HOLIDAYS: LeaveHolidayKeys = new Set<string>()

function isChargeableDay(date: Date, holidays: LeaveHolidayKeys): boolean {
  return !isWeekendDate(date) && !holidays.has(leaveDateKey(date))
}

export function calculateLeaveDays(startDate: Date, endDate: Date, holidays: LeaveHolidayKeys = NO_HOLIDAYS): number {
  if (!isValidLeaveDateRange(startDate, endDate)) {
    return 0
  }

  const current = toUtcDateOnly(startDate)
  const last = toUtcDateOnly(endDate)
  let count = 0

  while (current.getTime() <= last.getTime()) {
    if (isChargeableDay(current, holidays)) {
      count++
    }

    current.setUTCDate(current.getUTCDate() + 1)
  }

  return count
}

export function isValidLeaveDateRange(startDate: Date, endDate: Date): boolean {
  return endDate.getTime() >= startDate.getTime()
}

export function calculateLeaveDuration(
  startDate: Date,
  endDate: Date,
  isHalfDay: boolean,
  holidays: LeaveHolidayKeys = NO_HOLIDAYS
): number {
  if (isHalfDay) {
    if (!isValidLeaveDateRange(startDate, endDate)) return 0
    const start = toUtcDateOnly(startDate)
    const end = toUtcDateOnly(endDate)
    if (start.getTime() !== end.getTime()) return 0
    // A half day on a weekend or a holiday costs nothing: the person was off anyway.
    if (!isChargeableDay(start, holidays)) return 0
    return 0.5
  }

  return calculateLeaveDays(startDate, endDate, holidays)
}

export function leaveRequiresLeadApproval(
  leaveType: 'CASUAL' | 'SICK' | 'ANNUAL',
  isHalfDay: boolean,
  superiorLeadCount: number
): boolean {
  if (superiorLeadCount <= 0) {
    return false
  }

  if (!isHalfDay) {
    return true
  }

  return leaveType === 'CASUAL'
}

export function hasLeaveEnded(endDate: Date, now = new Date()): boolean {
  return toUtcDateOnly(endDate).getTime() < toUtcDateOnly(now).getTime()
}

// A leave is considered "started" (availed) once its start date is today or
// earlier. Cancellations/disapprovals may only restore balance before this.
export function leaveHasStarted(startDate: Date, now = new Date()): boolean {
  return toUtcDateOnly(startDate).getTime() <= toUtcDateOnly(now).getTime()
}

/** A leave can be cancelled until the day before its last day; on or after the last day it stands as taken. */
export function canCancelLeave(endDate: Date, now = new Date()): boolean {
  return toUtcDateOnly(endDate).getTime() > toUtcDateOnly(now).getTime()
}

/**
 * The days a cancellation gives back: the working days from today (or the start, if later) to the end.
 * A leave starting today returns in full; one already underway returns today and the rest; none once it cannot be cancelled.
 */
export function cancellableLeaveDays(
  leave: { startDate: Date; endDate: Date; isHalfDay: boolean },
  now = new Date(),
  holidays: LeaveHolidayKeys = NO_HOLIDAYS
): number {
  if (!canCancelLeave(leave.endDate, now)) return 0
  const today = toUtcDateOnly(now)
  const from = toUtcDateOnly(leave.startDate).getTime() > today.getTime() ? leave.startDate : today
  return calculateLeaveDuration(from, leave.endDate, leave.isHalfDay, holidays)
}
