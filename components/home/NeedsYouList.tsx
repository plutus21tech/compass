'use client'

import { useState } from 'react'
import Link from 'next/link'
import { SoftState } from '@/components/composed/SoftState'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/format-date'
import { isOverdue, type NeedsYouItem } from '@/lib/home/needs-you'

const SHOWN = 6

interface NeedsYouListProps {
  data: { items: NeedsYouItem[]; incomplete: boolean } | null
  todayKey: string
}

function Meta({ item, todayKey }: { item: NeedsYouItem; todayKey: string }) {
  const overdue = isOverdue(item, todayKey)
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
      {item.dueDay ? (
        <span className={overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-300'}>
          {overdue ? 'Overdue since' : 'Due'} {formatDate(item.dueDay)}
        </span>
      ) : null}
      {item.detail ? <span>{item.detail}</span> : null}
    </p>
  )
}

function Row({ item, first, todayKey }: { item: NeedsYouItem; first: boolean; todayKey: string }) {
  return (
    <li className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <p className="text-xs font-medium text-primary">{item.eyebrow}</p>
        <p className="font-medium text-foreground">{item.title}</p>
        <Meta item={item} todayKey={todayKey} />
      </div>
      <Button asChild variant={first ? 'default' : 'outline'} className="shrink-0">
        <Link href={item.href} prefetch={item.prefetch ? undefined : false}>
          {item.action}
        </Link>
      </Button>
    </li>
  )
}

function SkeletonRows() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4 p-5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-40" />
        </div>
      ))}
    </div>
  )
}

/** Nothing to do: centred in the card's height so the box reads as intentional, not broken. */
function AllClear() {
  return (
    <SoftState
      tone="success"
      title="You're all clear"
      description="Nothing needs you right now. New items show up here as they arrive."
      className="py-10"
    />
  )
}

export function NeedsYouList({ data, todayKey }: NeedsYouListProps) {
  const [expanded, setExpanded] = useState(false)
  const items = data?.items ?? []
  const visible = expanded ? items : items.slice(0, SHOWN)
  const hidden = items.length - visible.length

  return (
    <section aria-labelledby="needs-you-heading" className="flex flex-col">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="needs-you-heading" className="text-base font-semibold text-foreground">
          Needs you
        </h2>
        {data && items.length > 0 ? (
          <span className="text-sm text-muted-foreground">{items.length} open, sorted by due date</span>
        ) : null}
      </div>
      {/* Fills the row so its bottom edge lines up with My work. */}
      <Card className="flex flex-1 flex-col overflow-hidden">
        {data === null ? (
          <SkeletonRows />
        ) : items.length === 0 ? (
          data.incomplete ? null : <AllClear />
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((item, index) => (
              <Row key={item.key} item={item} first={index === 0} todayKey={todayKey} />
            ))}
          </ul>
        )}
        {data?.incomplete ? (
          <p className="border-t border-border px-5 py-3 text-sm text-muted-foreground">
            Some items could not be loaded. Refresh to try again.
          </p>
        ) : null}
        {hidden > 0 ? (
          <div className="border-t border-border px-5 py-3">
            <button type="button" onClick={() => setExpanded(true)} className="text-sm text-primary hover:underline">
              Show {hidden} more
            </button>
          </div>
        ) : null}
      </Card>
    </section>
  )
}
