import { isAssignableTeamTag, unknownTeamTags, type TeamCatalog } from '@/lib/teams/catalog'
import { expandHolidayTeamTags } from '@/lib/holidays'
import { leaveDateKey } from '@/lib/leave-utils'

/**
 * Leave-calendar holidays and birthdays: the pure rules, safe for client and server.
 *
 * Leave holidays are their own list, not payroll's: HR keeps them for the leave
 * calendar, and a working day that is a holiday for the person's team is not charged
 * as leave. The country pairing rule (Pakistan = both Pakistan entities) is the same
 * one public holidays use, so it is reused rather than restated.
 */

/**
 * The one place that decides which teams a leave holiday may be saved with, against
 * the HR-managed team catalog. Returns an error message, or null when the teams are fine.
 *
 * Unknown codes are refused. Archived teams cannot be newly chosen, but a holiday that
 * already carries one keeps it on edit, so re-saving an untouched holiday never fails.
 */
export function leaveHolidayTeamsError(
  catalog: TeamCatalog,
  requested: readonly string[],
  existing: readonly string[] = []
): string | null {
  const unknown = unknownTeamTags(catalog, requested)
  if (unknown.length > 0) return `Unknown team tag(s): ${unknown.join(', ')}`

  const archived = requested.filter((code) => !isAssignableTeamTag(catalog, code) && !existing.includes(code))
  if (archived.length > 0) return `These teams are archived and can no longer be chosen: ${archived.join(', ')}`
  return null
}

/** Teams widened to whole countries (Pakistan pairing), in catalog order. Validate first. */
export function normalizeLeaveHolidayTeams(catalog: TeamCatalog, teamTags: readonly string[]): string[] {
  return expandHolidayTeamTags(teamTags, catalog.all)
}

export type LeaveHolidayLike = {
  date: Date | string
  teamTags: readonly string[]
}

/**
 * Whether a leave holiday applies to someone. A person with no team tag gets no
 * holidays: guessing would mean guessing at their leave balance.
 */
export function leaveHolidayAppliesTo(holiday: Pick<LeaveHolidayLike, 'teamTags'>, teamTag: string | null | undefined): boolean {
  return Boolean(teamTag) && holiday.teamTags.includes(teamTag as string)
}

/** The holiday days (leaveDateKey) that are not charged as leave for someone on `teamTag`. */
export function leaveHolidayKeysForTeam(
  holidays: readonly LeaveHolidayLike[],
  teamTag: string | null | undefined
): Set<string> {
  return new Set(
    holidays
      .filter((holiday) => leaveHolidayAppliesTo(holiday, teamTag))
      .map((holiday) => leaveDateKey(new Date(holiday.date)))
  )
}

// ---------------------------------------------------------------------------
// Birthdays: day and month only, never a year.

const DAYS_IN_MONTH_LEAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function isValidBirthday(month: number, day: number): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false
  if (month < 1 || month > 12) return false
  return day >= 1 && day <= DAYS_IN_MONTH_LEAP[month - 1]
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** The day of the month a birthday falls on in `year`: Feb 29 is marked on Feb 28 in non-leap years. */
export function birthdayDayInYear(month: number, day: number, year: number): number {
  return month === 2 && day === 29 && !isLeapYear(year) ? 28 : day
}

export type BirthdayLike = { userId: string; name: string; month: number; day: number }
export type CalendarBirthday = { userId: string; name: string; day: number }

/** Birthdays in a month (`monthIndex` 0-11, as the calendar uses), ordered by day then name. */
export function birthdaysInMonth(
  birthdays: readonly BirthdayLike[],
  year: number,
  monthIndex: number
): CalendarBirthday[] {
  return birthdays
    .filter((birthday) => birthday.month === monthIndex + 1)
    .map((birthday) => ({
      userId: birthday.userId,
      name: birthday.name,
      day: birthdayDayInYear(birthday.month, birthday.day, year),
    }))
    .sort((a, b) => a.day - b.day || a.name.localeCompare(b.name))
}
