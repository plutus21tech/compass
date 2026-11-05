// Pure rules: no server-only imports. Safe for client components.
import type { OfficeLocation, TeamTag } from '@prisma/client'
import { endOfDayInZone } from './time'

const WEEK_1_WORKING_DAYS = 5
const DAY_MS = 86_400_000
const SUNDAY = 0
const SATURDAY = 6

const TEAM_BY_OFFICE: Partial<Record<OfficeLocation, TeamTag>> = {
  KARACHI: 'PAKISTAN',
  CASABLANCA: 'MOROCCO',
  BOGOTA: 'COLOMBIA',
}

/** Which holiday calendar applies: an explicit team tag wins, else the office's own team. */
export function holidayTeamFor(teamTag: TeamTag | null, location: OfficeLocation | null): TeamTag | null {
  if (teamTag) return teamTag
  return location ? (TEAM_BY_OFFICE[location] ?? null) : null
}

export interface ModuleDueInput {
  phase: 'DAY_1' | 'WEEK_1'
  joiningDate: Date
  timeZone: string | null
  holidayKeys: ReadonlySet<string>
}

function dateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

function isWorkingDay(ms: number, holidayKeys: ReadonlySet<string>): boolean {
  const weekday = new Date(ms).getUTCDay()
  return weekday !== SUNDAY && weekday !== SATURDAY && !holidayKeys.has(dateKey(ms))
}

/** The calendar day (as UTC midnight ms) that falls `count` working days after the start day. */
function addWorkingDays(startMs: number, count: number, holidayKeys: ReadonlySet<string>): number {
  let current = startMs
  let remaining = count
  while (remaining > 0) {
    current += DAY_MS
    if (isWorkingDay(current, holidayKeys)) remaining -= 1
  }
  return current
}

/** DAY_1 is due at the end of the joining date; WEEK_1 five working days later. All in the hire's zone. */
export function moduleDueAt({ phase, joiningDate, timeZone, holidayKeys }: ModuleDueInput): Date {
  const joiningMs = Date.UTC(joiningDate.getUTCFullYear(), joiningDate.getUTCMonth(), joiningDate.getUTCDate())
  const dueMs = phase === 'DAY_1' ? joiningMs : addWorkingDays(joiningMs, WEEK_1_WORKING_DAYS, holidayKeys)
  return endOfDayInZone(dateKey(dueMs), timeZone)
}
