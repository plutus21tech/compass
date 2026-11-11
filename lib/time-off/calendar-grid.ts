import { toDateKey, type CalendarEvent, type DirectoryUser } from './types'

export const BUSY_DAY_THRESHOLD = 5
export const MAX_CHIPS = 3
const MAX_MONTHS = 13
const KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export interface GridDay {
  key: string
  day: number
  inMonth: boolean
  isWeekend: boolean
}

export interface DayCell extends GridDay {
  isToday: boolean
  isPast: boolean
  selectable: boolean
  events: CalendarEvent[]
  visible: CalendarEvent[]
  moreCount: number
  outCount: number
  busy: boolean
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** Monday-first month grid covering only the weeks the month touches. */
export function buildMonthGrid(year: number, monthIndex: number): GridDay[] {
  // All arithmetic is done in UTC so the host time zone never shifts a day.
  const first = new Date(Date.UTC(year, monthIndex, 1))
  const lead = (first.getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const weeks = Math.ceil((lead + daysInMonth) / 7)
  const days: GridDay[] = []
  for (let i = 0; i < weeks * 7; i += 1) {
    const d = new Date(Date.UTC(year, monthIndex, 1 - lead + i))
    const dow = d.getUTCDay()
    days.push({
      key: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === monthIndex,
      isWeekend: dow === 0 || dow === 6,
    })
  }
  return days
}

export function eventsOnDay(events: CalendarEvent[], key: string): CalendarEvent[] {
  return events
    .filter((event) => {
      const start = toDateKey(event.startDate)
      const end = toDateKey(event.endDate)
      return Boolean(start) && Boolean(end) && start <= key && key <= end
    })
    .sort((a, b) => {
      if (a.isCurrentUser !== b.isCurrentUser) return a.isCurrentUser ? -1 : 1
      return a.employeeName.localeCompare(b.employeeName)
    })
}

export function filterEventsByDepartment(events: CalendarEvent[], filter: string): CalendarEvent[] {
  if (filter === 'ALL') return events
  const selected = filter.trim()
  return events.filter((event) => event.isCurrentUser || event.department?.trim() === selected)
}

export function calendarDepartments(users: DirectoryUser[], events: CalendarEvent[]): string[] {
  const values = new Set<string>()
  for (const person of users) {
    const department = person.department?.trim()
    if (department) values.add(department)
  }
  for (const event of events) {
    const department = event.department?.trim()
    if (department) values.add(department)
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b))
}

export function buildDayCells(grid: GridDay[], events: CalendarEvent[], todayKey: string): DayCell[] {
  return grid.map((day) => {
    const dayEvents = day.inMonth ? eventsOnDay(events, day.key) : []
    const outCount = new Set(dayEvents.map((event) => event.employeeId)).size
    const isPast = day.key < todayKey
    return {
      ...day,
      isToday: day.key === todayKey,
      isPast,
      selectable: day.inMonth && !isPast,
      events: dayEvents,
      visible: dayEvents.slice(0, MAX_CHIPS),
      moreCount: Math.max(0, dayEvents.length - MAX_CHIPS),
      outCount,
      busy: outCount >= BUSY_DAY_THRESHOLD,
    }
  })
}

export function monthsBetween(startKey: string, endKey: string): Array<{ year: number; month: number }> {
  const s = KEY_PATTERN.exec(startKey)
  const e = KEY_PATTERN.exec(endKey)
  if (!s || !e || endKey < startKey) return []
  const result: Array<{ year: number; month: number }> = []
  let year = Number(s[1])
  let month = Number(s[2]) - 1
  const endYear = Number(e[1])
  const endMonth = Number(e[2]) - 1
  while ((year < endYear || (year === endYear && month <= endMonth)) && result.length < MAX_MONTHS) {
    result.push({ year, month })
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
  }
  return result
}

export function outToday(events: CalendarEvent[], todayKey: string): CalendarEvent[] {
  return events.filter((event) => {
    const start = toDateKey(event.startDate)
    const end = toDateKey(event.endDate)
    if (!start || !end) return false
    return todayKey >= start && todayKey <= end && !event.isCurrentUser && event.status === 'APPROVED'
  })
}
