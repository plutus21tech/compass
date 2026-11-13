import { leaveDateKey } from '../leave-utils'

const MS_PER_DAY = 86_400_000

const karachiFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Karachi',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** YYYY-MM-DD of the instant on the Karachi calendar. */
export function karachiDayKey(instant: Date): string {
  const parts = Object.fromEntries(karachiFormatter.formatToParts(instant).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

/** A date-only value (stored at UTC midnight) as YYYY-MM-DD. */
export function dayKeyOf(value: string | Date): string {
  return leaveDateKey(typeof value === 'string' ? new Date(value) : value)
}

function keyToUtcMs(key: string): number {
  return Date.parse(`${key}T00:00:00Z`)
}

/** Whole days from fromKey to toKey (toKey - fromKey). */
export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((keyToUtcMs(toKey) - keyToUtcMs(fromKey)) / MS_PER_DAY)
}

export function addDays(key: string, days: number): string {
  return new Date(keyToUtcMs(key) + days * MS_PER_DAY).toISOString().slice(0, 10)
}

export function greetingFor(localHour: number): 'Good morning' | 'Good afternoon' | 'Good evening' {
  if (localHour < 12) return 'Good morning'
  if (localHour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function inDaysPhrase(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `In ${days} days`
}
