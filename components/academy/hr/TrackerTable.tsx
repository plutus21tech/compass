'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatAcademyDate } from '@/lib/academy/view-labels'
import { NO_CHECKLIST, OVERDUE_COLUMN, progressText, trackerEmptyMessage } from '@/lib/academy/tracker-labels'
import type { TrackerRow } from '@/lib/academy/tracker'
import { DATE_ZONE } from './tracker-api'

function Bar({ done, total, label, empty }: { done: number; total: number; label: string; empty?: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-1.5 w-10 shrink-0 lg:w-16 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">{progressText(done, total, empty)}</span>
    </div>
  )
}

interface Props {
  rows: readonly TrackerRow[]
  filtered: boolean
  onOpen: (newHireId: string) => void
}

export function TrackerTable({ rows, filtered, onOpen }: Props) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">{trackerEmptyMessage(filtered)}</p>
  }
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="hidden lg:table-cell">Title</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Joining</TableHead>
            <TableHead>Modules done</TableHead>
            <TableHead className="text-right">{OVERDUE_COLUMN}</TableHead>
            <TableHead>Quiz</TableHead>
            <TableHead>HR checklist</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.newHireId} className="cursor-pointer" onClick={() => onOpen(row.newHireId)}>
              <TableCell className="font-medium">
                <button
                  type="button"
                  className="rounded text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Open ${row.name}`}
                  onClick={(e) => { e.stopPropagation(); onOpen(row.newHireId) }}
                >
                  {row.name}
                </button>
                <span className="block text-xs font-normal text-muted-foreground lg:hidden">{row.title}</span>
              </TableCell>
              <TableCell className="hidden lg:table-cell">{row.title}</TableCell>
              <TableCell>{row.location ?? '-'}</TableCell>
              <TableCell className="whitespace-nowrap">{formatAcademyDate(row.joiningDate, DATE_ZONE)}</TableCell>
              <TableCell><Bar done={row.modulesDone} total={row.modulesTotal} label={`${row.name}: modules done`} /></TableCell>
              <TableCell className={`text-right tabular-nums ${row.overdueCount > 0 ? 'font-medium text-red-700 dark:text-red-300' : ''}`}>{row.overdueCount}</TableCell>
              <TableCell className="whitespace-nowrap">{row.quizScore ?? '-'}</TableCell>
              <TableCell><Bar done={row.checklistDone} total={row.checklistTotal} label={`${row.name}: HR checklist`} empty={NO_CHECKLIST} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
