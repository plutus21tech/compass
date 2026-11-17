'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  CALENDAR_SHOW_OPTIONS,
  HOLIDAY_TEAM_ALL,
  HOLIDAY_TEAM_MINE,
  holidayTeamFilterApplies,
  type CalendarShow,
  type HolidayTeamOption,
} from '@/lib/time-off/calendar-filters'

export interface CalendarFiltersProps {
  show: CalendarShow
  onShowChange: (show: CalendarShow) => void
  holidayTeam: string
  onHolidayTeamChange: (team: string) => void
  holidayTeams: HolidayTeamOption[]
}

const SEGMENT = 'rounded-md px-3 py-1 text-sm transition-colors'
const ACTIVE = 'bg-background text-foreground shadow-sm'
const IDLE = 'text-muted-foreground hover:text-foreground'

/** What the calendar shows (leave, public holidays, birthdays) and whose public holidays. */
export function CalendarFilters({ show, onShowChange, holidayTeam, onHolidayTeamChange, holidayTeams }: CalendarFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex flex-wrap rounded-lg bg-muted p-0.5" role="group" aria-label="Show on the calendar">
        {CALENDAR_SHOW_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={show === option.value}
            className={`${SEGMENT} ${show === option.value ? ACTIVE : IDLE}`}
            onClick={() => onShowChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {holidayTeamFilterApplies(show) && holidayTeams.length > 0 && (
        <Select value={holidayTeam} onValueChange={onHolidayTeamChange}>
          <SelectTrigger className="h-8 w-[13rem]" aria-label="Public holidays for">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={HOLIDAY_TEAM_MINE}>My team&apos;s holidays</SelectItem>
            <SelectItem value={HOLIDAY_TEAM_ALL}>All teams&apos; holidays</SelectItem>
            {holidayTeams.map((team) => (
              <SelectItem key={team.code} value={team.code}>
                {team.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
