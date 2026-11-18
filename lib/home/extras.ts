// The smaller pieces of Home: what was done this week, a quick due date, and recent updates on your tasks.
// All worked out from what existing endpoints already return.
import { addDays, karachiDayKey } from './time'

export interface DoneItem {
  key: string
  title: string
  /** The Karachi day it was done, YYYY-MM-DD. */
  day: string
}

const dayOfWeek = (key: string): number => new Date(`${key}T00:00:00Z`).getUTCDay()

/** The Monday of the week `todayKey` falls in. */
export function weekStartKey(todayKey: string): string {
  return addDays(todayKey, -((dayOfWeek(todayKey) + 6) % 7))
}

export interface DoneSources {
  /** When this week's evaluation answers were sent; null if they were not. */
  weekSubmittedAt: string | null
  selfReviews: ReadonlyArray<{ monthName: string; submittedAt: string }>
}

/** What the person finished since Monday, newest first. */
export function doneThisWeek(sources: DoneSources, todayKey: string): DoneItem[] {
  const from = weekStartKey(todayKey)
  const items: DoneItem[] = []
  if (sources.weekSubmittedAt) {
    const day = karachiDayKey(new Date(sources.weekSubmittedAt))
    if (day >= from) items.push({ key: 'weekly', title: 'This week’s evaluation questions', day })
  }
  for (const review of sources.selfReviews) {
    const day = karachiDayKey(new Date(review.submittedAt))
    if (day >= from) items.push({ key: `self-review:${review.submittedAt}`, title: `${review.monthName} self-evaluation`, day })
  }
  return items.sort((a, b) => b.day.localeCompare(a.day))
}

const FRIDAY = 5

/** The Friday to offer as a due date: this week's, or next week's once this Friday has passed. */
export function nextFridayKey(todayKey: string): string {
  const ahead = (FRIDAY - dayOfWeek(todayKey) + 7) % 7
  return addDays(todayKey, ahead)
}

export interface TaskActivityRow {
  id: string
  summary: string
  createdAt: string
  actor: { id: string; name: string } | null
}

export interface TaskUpdate {
  id: string
  taskId: string
  summary: string
  createdAt: string
}

export const UPDATES_SHOWN = 3

/** Changes other people made to the viewer's open tasks, newest first; the viewer's own changes are not news. */
export function recentUpdates(
  perTask: ReadonlyArray<{ taskId: string; activities: readonly TaskActivityRow[] }>,
  viewerId: string,
  shown: number = UPDATES_SHOWN
): { shown: TaskUpdate[]; more: number } {
  const all = perTask
    .flatMap(({ taskId, activities }) =>
      activities
        .filter((a) => a.actor !== null && a.actor.id !== viewerId)
        .map((a) => ({ id: a.id, taskId, summary: a.summary, createdAt: a.createdAt }))
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return { shown: all.slice(0, shown), more: Math.max(0, all.length - shown) }
}
