export type NeedsYouSource =
  | 'weekly' | 'late-forms' | 'self-review' | 'academy' | 'team-lead-form'
  | 'leave-approval' | 'wfh-approval' | 'own-plan' | 'security-check' | 'tickets'

export const SOURCE_ORDER: readonly NeedsYouSource[] = [
  'weekly', 'late-forms', 'self-review', 'academy', 'team-lead-form',
  'leave-approval', 'wfh-approval', 'own-plan', 'security-check', 'tickets',
]

export interface NeedsYouItem {
  key: string
  source: NeedsYouSource
  eyebrow: string
  title: string
  detail: string | null
  /** Karachi YYYY-MM-DD, or null when nothing is due on a day. */
  dueDay: string | null
  href: string
  action: string
  prefetch: boolean
}

/** Due day ascending, undated last, ties by source order then title. */
export function sortNeedsYou(items: readonly NeedsYouItem[]): NeedsYouItem[] {
  return [...items].sort((a, b) => {
    if (a.dueDay !== b.dueDay) {
      if (a.dueDay === null) return 1
      if (b.dueDay === null) return -1
      return a.dueDay < b.dueDay ? -1 : 1
    }
    const bySource = SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source)
    return bySource !== 0 ? bySource : a.title.localeCompare(b.title)
  })
}

export function isOverdue(item: NeedsYouItem, todayKey: string): boolean {
  return item.dueDay !== null && item.dueDay < todayKey
}
