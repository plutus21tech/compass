/**
 * The one date style for employee pages: "Thu 5 Nov", with the year when it
 * isn't the current year ("Thu 5 Nov 2025"). Output never depends on the
 * machine's or browser's time zone or locale.
 *
 * Date-only values (leave dates, holidays, due dates) keep their calendar day.
 * Instants (created/updated at) are shown in Karachi time.
 */

export type DateInput = string | Date

export interface FormatOptions {
  now?: Date
  fallback?: string
}

const KARACHI = 'Asia/Karachi'
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/
const RANGE_SEPARATOR = ' – '

interface DayParts {
  weekday: string
  day: string
  month: string
  year: string
}

const UTC_DAY = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const KARACHI_DAY = new Intl.DateTimeFormat('en-GB', {
  timeZone: KARACHI,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const KARACHI_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: KARACHI,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const UTC_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const KARACHI_YEAR = new Intl.DateTimeFormat('en-GB', { timeZone: KARACHI, year: 'numeric' })

function toInstant(value: DateInput | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** A date-only value as midnight UTC of its calendar day. */
function toCalendarDay(value: DateInput | null | undefined): Date | null {
  if (typeof value === 'string') {
    const match = DATE_ONLY.exec(value)
    if (match) {
      const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
      return Number.isNaN(day.getTime()) ? null : day
    }
  }
  const instant = toInstant(value)
  if (!instant) return null
  return new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()))
}

function partsOf(formatter: Intl.DateTimeFormat, date: Date): DayParts {
  const parts = formatter.formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return { weekday: pick('weekday'), day: pick('day'), month: pick('month'), year: pick('year') }
}

function currentYear(now: Date): string {
  return KARACHI_YEAR.format(now)
}

function dayLabel(parts: DayParts, withYear: boolean): string {
  const base = `${parts.weekday} ${parts.day} ${parts.month}`
  return withYear ? `${base} ${parts.year}` : base
}

/** A date-only value: "Thu 5 Nov", or "Thu 5 Nov 2025" in another year. */
export function formatDate(value: DateInput | null | undefined, options: FormatOptions = {}): string {
  const day = toCalendarDay(value)
  if (!day) return options.fallback ?? ''
  const parts = partsOf(UTC_DAY, day)
  return dayLabel(parts, parts.year !== currentYear(options.now ?? new Date()))
}

/** An instant, shown as its Karachi calendar day. */
export function formatTimestampDate(value: DateInput | null | undefined, options: FormatOptions = {}): string {
  const instant = toInstant(value)
  if (!instant) return options.fallback ?? ''
  const parts = partsOf(KARACHI_DAY, instant)
  return dayLabel(parts, parts.year !== currentYear(options.now ?? new Date()))
}

/** Karachi time of day, 24-hour: "14:30". */
export function formatTime(value: DateInput | null | undefined, options: { fallback?: string } = {}): string {
  const instant = toInstant(value)
  if (!instant) return options.fallback ?? ''
  return KARACHI_TIME.format(instant)
}

/** An instant: "Thu 5 Nov, 14:30" in Karachi time. */
export function formatDateTime(value: DateInput | null | undefined, options: FormatOptions = {}): string {
  const instant = toInstant(value)
  if (!instant) return options.fallback ?? ''
  return `${formatTimestampDate(instant, options)}, ${formatTime(instant)}`
}

/** A date-only range: "Thu 19 – Mon 23 Nov", "Fri 30 Oct – Tue 3 Nov". */
export function formatDateRange(start: DateInput, end: DateInput, options: FormatOptions = {}): string {
  const startDay = toCalendarDay(start)
  const endDay = toCalendarDay(end)
  if (!startDay || !endDay) return formatDate(startDay ?? endDay, options)
  if (startDay.getTime() === endDay.getTime()) return formatDate(startDay, options)

  const from = partsOf(UTC_DAY, startDay)
  const to = partsOf(UTC_DAY, endDay)
  const thisYear = currentYear(options.now ?? new Date())

  if (from.year !== to.year) {
    return `${dayLabel(from, true)}${RANGE_SEPARATOR}${dayLabel(to, true)}`
  }
  const yearSuffix = to.year === thisYear ? '' : ` ${to.year}`
  const left = from.month === to.month ? `${from.weekday} ${from.day}` : dayLabel(from, false)
  return `${left}${RANGE_SEPARATOR}${dayLabel(to, false)}${yearSuffix}`
}

/** A date-only month: "November 2026". */
export function formatMonthYear(value: DateInput): string {
  const day = toCalendarDay(value)
  return day ? UTC_MONTH_YEAR.format(day) : ''
}
