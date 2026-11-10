'use client'

import { Fragment, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PendingEvaluatorView, WeekProgressView } from '@/lib/weekly/view-types'
import { RateBar } from './RateBar'

interface Props {
  rows: WeekProgressView[]
  currentWeek: number
  /** The person being reminded right now, so only their button waits. */
  remindingId: string | null
  onRemind: (person: PendingEvaluatorView) => void
}

/** Progress by week; open a week to see who still has its questions open and remind them one by one. */
export function WeekProgressTable({ rows, currentWeek, remindingId, onRemind }: Props) {
  const [openWeeks, setOpenWeeks] = useState<ReadonlySet<number>>(new Set())
  const toggle = (week: number) => setOpenWeeks((prev) => {
    const next = new Set(prev)
    if (next.has(week)) next.delete(week)
    else next.add(week)
    return next
  })

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No questions yet.</p>
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground"><th className="pb-2">Week</th><th className="pb-2">Asked</th><th className="pb-2">Answered</th><th className="pb-2">Rate</th></tr></thead>
      <tbody>
        {rows.map((w) => {
          const expanded = openWeeks.has(w.week)
          return (
            <Fragment key={w.week}>
              <tr className="border-t border-border/60 tabular-nums">
                <td className="py-2">
                  <button type="button" className="flex items-center gap-1 font-medium hover:text-primary" aria-expanded={expanded} onClick={() => toggle(w.week)}>
                    <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')} aria-hidden />
                    Week {w.week}
                  </button>
                </td>
                <td>{w.asked}</td>
                <td>{w.answered}</td>
                <td><RateBar value={w.asked ? w.answered / w.asked : null} /></td>
              </tr>
              {expanded ? (
                <tr>
                  <td colSpan={4} className="pb-3 pl-5">
                    <PendingList week={w.week} overdue={w.week < currentWeek} people={w.pending} remindingId={remindingId} onRemind={onRemind} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

function PendingList({ week, overdue, people, remindingId, onRemind }: { week: number; overdue: boolean; people: PendingEvaluatorView[]; remindingId: string | null; onRemind: (person: PendingEvaluatorView) => void }) {
  if (people.length === 0) return <p className="text-xs text-muted-foreground">Everyone has answered week {week}.</p>
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{people.length} {people.length === 1 ? 'person' : 'people'} pending{overdue ? ', overdue' : ''}</p>
      <ul className="divide-y divide-border/50 rounded-lg border border-border/60">
        {people.map((p) => (
          <li key={p.evaluator.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
            <span className="min-w-0 truncate">
              {p.evaluator.name}
              <span className="ml-2 text-xs text-muted-foreground tabular-nums">{p.open} open</span>
              {overdue ? <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">Overdue</span> : null}
            </span>
            {p.remindedToday ? (
              <span className="shrink-0 text-xs text-muted-foreground">Reminded today</span>
            ) : (
              <Button variant="outline" size="sm" className="h-7 shrink-0" disabled={remindingId !== null} onClick={() => onRemind(p)}>
                {remindingId === p.evaluator.id ? 'Sending…' : 'Remind'}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
