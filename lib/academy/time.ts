// Pure rules: no server-only imports. Safe for client components.
import { countryOf, type PersonAttributes } from './attributes'

const ZONE_BY_COUNTRY: Record<string, string> = {
  PK: 'Asia/Karachi',
  MA: 'Africa/Casablanca',
  CO: 'America/Bogota',
  US: 'America/Chicago',
  ID: 'Asia/Jakarta',
  EC: 'America/Guayaquil',
}

const SOURCE_ZONE = 'America/Chicago'
const OVERLAP_ZONE = 'Asia/Karachi'
const OVERLAP_START_HOUR = 17
const OVERLAP_END_HOUR = 20
const OVERLAP_FALLBACK = '5 PM to 8 PM PKT'
const MINUTE_MS = 60_000

/** null for any country we have no zone for: callers show the source time and never guess. */
export function timeZoneFor(attrs: Pick<PersonAttributes, 'officeLocation' | 'remoteCountry'>): string | null {
  const country = countryOf(attrs)
  return country ? (ZONE_BY_COUNTRY[country] ?? null) : null
}

/** Minutes the zone is ahead of UTC at the given instant. */
function offsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(at)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / MINUTE_MS)
}

/** The instant a wall-clock time (given as if it were UTC) happens in the zone. */
function wallClockToInstant(wallAsUtcMs: number, timeZone: string): Date {
  const first = wallAsUtcMs - offsetMinutes(timeZone, new Date(wallAsUtcMs)) * MINUTE_MS
  const refined = wallAsUtcMs - offsetMinutes(timeZone, new Date(first)) * MINUTE_MS
  return new Date(refined)
}

/** The last millisecond of a YYYY-MM-DD day in the zone (UTC when the zone is unknown). */
export function endOfDayInZone(dateKey: string, timeZone: string | null): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  const wall = Date.UTC(year, month - 1, day, 23, 59, 59, 999)
  return timeZone ? wallClockToInstant(wall, timeZone) : new Date(wall)
}

function formatClock(hour: number, minute: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`
}

/** Re-expresses a clock time from one zone in another, using the offsets in force at `now`. */
function convertClock(hour: number, minute: number, fromZone: string, toZone: string, now: Date): string {
  const shift = offsetMinutes(toZone, now) - offsetMinutes(fromZone, now)
  const total = (((hour * 60 + minute + shift) % 1440) + 1440) % 1440
  return formatClock(Math.floor(total / 60), total % 60)
}

/** Stored like "WED 07:00" in Chicago time. Without a zone, the source time is shown with "CT". */
export function blockersCallLocal(stored: string, timeZone: string | null, now: Date): string {
  const [, clock = '00:00'] = stored.split(' ')
  const [hour, minute] = clock.split(':').map(Number)
  if (!timeZone) return `${formatClock(hour, minute)} CT`
  return convertClock(hour, minute, SOURCE_ZONE, timeZone, now)
}

/** The 5 PM to 8 PM PKT overlap with the leadership team, in the hire's own time. */
export function overlapWindowLocal(timeZone: string | null, now: Date): string {
  if (!timeZone) return OVERLAP_FALLBACK
  const start = convertClock(OVERLAP_START_HOUR, 0, OVERLAP_ZONE, timeZone, now)
  const end = convertClock(OVERLAP_END_HOUR, 0, OVERLAP_ZONE, timeZone, now)
  return `${start} to ${end}`
}
