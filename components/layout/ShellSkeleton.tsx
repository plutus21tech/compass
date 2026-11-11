import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

const NAV_ROWS = 7

/** Sidebar placeholder shown while the session loads. Same widths as AppSidebar. */
export function SidebarSkeleton({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      aria-hidden="true"
      className={cn(
        'flex h-screen flex-col border-r border-border bg-card transition-all duration-200 ease-in-out',
        collapsed ? 'w-[60px]' : 'w-[240px]',
      )}
    >
      <div className={cn('flex h-14 shrink-0 items-center border-b border-border px-3', collapsed ? 'justify-center' : 'gap-3')}>
        <Skeleton className="h-6 w-6 shrink-0" />
        {!collapsed && <Skeleton className="h-4 w-28" />}
      </div>
      <div className="flex-1 space-y-2 px-2 py-3">
        {Array.from({ length: NAV_ROWS }, (_, i) => (
          <Skeleton key={i} className={cn('h-8', collapsed ? 'mx-auto w-8' : 'w-full')} />
        ))}
      </div>
    </aside>
  )
}

/** Page placeholder: a header bar and three card blocks. */
export function PageSkeleton() {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <Skeleton className="mb-6 h-9 w-64" />
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  )
}
