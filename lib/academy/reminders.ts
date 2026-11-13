// Pure rules for the reminder job (three daily runs on the Hobby plan, see vercel.json). Server only because of the cron check, but free of data access.
import { isCronAuthorized } from '@/lib/cron-auth'
import type { AutoTickEvent } from './checklist'
import { moduleCardState, type ModuleCardRow } from './progress'

const DEFAULT_ZONE = 'Asia/Karachi'
const DAY_MS = 86_400_000
const REMINDER_HOUR = 10
/**
 * Reminders first go at 10:00. Later runs of the same working day keep the window open, because a send
 * that failed, or a cron run that came late, would otherwise wait for a date that never comes back.
 * The once-only log stops anyone hearing twice.
 */
const REMINDER_HOURS = [REMINDER_HOUR, 11, 12, 13, 14, 15, 16, 17] as const

function localParts(now: Date, timeZone: string | null): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone ?? DEFAULT_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
  }).formatToParts(now)
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) }
}

export function isLocalHour(now: Date, timeZone: string | null, hour: number): boolean {
  return localParts(now, timeZone).hour === hour
}

export function isReminderWindow(now: Date, timeZone: string | null): boolean {
  return REMINDER_HOURS.some((hour) => isLocalHour(now, timeZone, hour))
}

/** The YYYY-MM-DD date in the zone, as it goes into a notice key. */
export function localDateKey(now: Date, timeZone: string | null): string {
  return localParts(now, timeZone).date
}

const dayNumber = (dateKey: string): number => Date.parse(`${dateKey}T00:00:00.000Z`) / DAY_MS

/**
 * 1 on the first local day past the due date, 0 until then. Counted from the instant after the due
 * date, so it is right whichever zone the date was worked out in, and never 0 for something overdue.
 */
export function overdueDayCount(oldestDueAt: Date, now: Date, timeZone: string | null): number {
  if (now.getTime() <= oldestDueAt.getTime()) return 0
  const firstOverdueDay = localDateKey(new Date(oldestDueAt.getTime() + 1), timeZone)
  return dayNumber(localDateKey(now, timeZone)) - dayNumber(firstOverdueDay) + 1
}

export interface OverdueSummary {
  count: number
  oldestDueAt: Date
}

/** What is overdue among a hire's course rows, by the same rule the module cards show. */
export function oldestOverdue(rows: readonly ModuleCardRow[], now: Date): OverdueSummary | null {
  const dueDates = rows.flatMap((row) => (row.dueAt && moduleCardState(row, now).overdue ? [row.dueAt.getTime()] : []))
  if (dueDates.length === 0) return null
  return { count: dueDates.length, oldestDueAt: new Date(Math.min(...dueDates)) }
}

/** Open until the hire acts, so mailing the item's owner would chase someone who can't clear it. */
const HIRE_DRIVEN_EVENTS: readonly string[] = [
  'SECURITY_ACK_SIGNED',
  'PAYMENT_SETUP_DONE',
  'DISCORD_USERNAME_SAVED',
  'COURSE_COMPLETED',
] satisfies readonly AutoTickEvent[]
const LINKEDIN_EVENT: AutoTickEvent = 'LINKEDIN_VERIFIED'
/** The lead's overdue reminder already covers this one. */
const LEAD_INPUT_ITEM_KEY = 'lead-input'

/** Whether an open item belongs in its owner's digest. HR can only verify a LinkedIn link once there is one. */
export function isOwnerChasable(item: { key: string; autoTickEvent: string | null }, linkedinSubmitted: boolean): boolean {
  if (item.key === LEAD_INPUT_ITEM_KEY) return false
  if (item.autoTickEvent === LINKEDIN_EVENT) return linkedinSubmitted
  return item.autoTickEvent === null || !HIRE_DRIVEN_EVENTS.includes(item.autoTickEvent)
}

export type CronGate = { action: 'refuse'; status: 401 } | { action: 'run' }

/** The job runs only with the cron secret. */
export function onboardingCronGate(
  authorization: string | null,
  env: Record<string, string | undefined> = process.env,
): CronGate {
  if (!isCronAuthorized(authorization, env.CRON_SECRET)) return { action: 'refuse', status: 401 }
  return { action: 'run' }
}
