import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/format-date'
import { cn } from '@/lib/utils'
import type { BellItem } from '@/lib/notifications/service'

interface BellListProps {
  items: readonly BellItem[]
  loading: boolean
  error: string | null
  onSelect: (item: BellItem) => void
  now?: Date
}

export function BellList({ items, loading, error, onSelect, now }: BellListProps) {
  if (loading) {
    return (
      <div className="space-y-3 p-3" aria-hidden="true">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    )
  }
  if (error) {
    return <p className="p-4 text-sm text-muted-foreground">Could not load notifications.</p>
  }
  if (items.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Nothing new. Updates about your leave, evaluations and security checks show up here.
      </p>
    )
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={`${item.source}:${item.id}`}>
          <button
            type="button"
            onClick={() => onSelect(item)}
            className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="mt-1.5 h-2 w-2 shrink-0" aria-hidden="true">
              {!item.read && <span data-unread="true" className="block h-2 w-2 rounded-full bg-primary" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn('block text-sm text-foreground', !item.read && 'font-medium')}>{item.title}</span>
              {item.detail && <span className="mt-0.5 block text-xs text-muted-foreground">{item.detail}</span>}
              <span className="mt-0.5 block text-xs text-muted-foreground">{formatDateTime(item.createdAt, { now })}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
