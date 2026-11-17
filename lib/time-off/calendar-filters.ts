/**
 * What the calendar shows: leave, public holidays, birthdays, and whose holidays.
 * Pure, so the page and tests share one rule.
 *
 * These filters only change what is drawn. The holidays that reduce a leave charge
 * are always the viewer's own team's, and come from a separate list.
 */

export type CalendarShow = 'ALL' | 'LEAVE' | 'HOLIDAYS' | 'BIRTHDAYS'

export const CALENDAR_SHOW_OPTIONS: readonly { value: CalendarShow; label: string }[] = [
  { value: 'ALL', label: 'Everything' },
  { value: 'LEAVE', label: 'Leave' },
  { value: 'HOLIDAYS', label: 'Public holidays' },
  { value: 'BIRTHDAYS', label: 'Birthdays' },
]

/** The viewer's own team: the default, and the holidays that affect their leave. */
export const HOLIDAY_TEAM_MINE = 'MINE'
export const HOLIDAY_TEAM_ALL = 'ALL'

export interface ShownHoliday {
  id: string
  date: string // YYYY-MM-DD
  name: string
  /** Who observes it, for the tooltip when other teams' holidays are shown. */
  teams?: string
}

export interface TeamHoliday extends ShownHoliday {
  teamTags: string[]
}

export interface HolidayTeamOption {
  code: string
  label: string
}

export const holidayTeamFilterApplies = (show: CalendarShow): boolean => show === 'ALL' || show === 'HOLIDAYS'

export function visibleEvents<T>(show: CalendarShow, events: T[]): T[] {
  return show === 'ALL' || show === 'LEAVE' ? events : []
}

export function visibleBirthdays<T>(show: CalendarShow, birthdays: T[]): T[] {
  return show === 'ALL' || show === 'BIRTHDAYS' ? birthdays : []
}

function observedBy(teamTags: readonly string[], teams: readonly HolidayTeamOption[]): string {
  if (teams.length > 1 && teams.every((team) => teamTags.includes(team.code))) return 'All teams'
  return teamTags.map((code) => teams.find((team) => team.code === code)?.label ?? code).join(', ')
}

/**
 * The holidays to draw. `teamFilter` is HOLIDAY_TEAM_MINE, HOLIDAY_TEAM_ALL, or a team code.
 */
export function visibleHolidays(
  show: CalendarShow,
  teamFilter: string,
  mine: readonly ShownHoliday[],
  all: readonly TeamHoliday[],
  teams: readonly HolidayTeamOption[]
): ShownHoliday[] {
  if (!holidayTeamFilterApplies(show)) return []
  if (teamFilter === HOLIDAY_TEAM_MINE) return [...mine]
  const chosen = teamFilter === HOLIDAY_TEAM_ALL ? all : all.filter((holiday) => holiday.teamTags.includes(teamFilter))
  return chosen.map((holiday) => ({
    id: holiday.id,
    date: holiday.date,
    name: holiday.name,
    teams: observedBy(holiday.teamTags, teams),
  }))
}
