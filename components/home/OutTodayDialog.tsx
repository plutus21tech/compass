'use client'

import Link from 'next/link'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDateRange } from '@/lib/format-date'
import { LEAVE_TYPE_LABEL, LEAVE_TYPE_TONE } from '@/lib/leave-type-style'
import { PENDING_STATUSES, type OutPerson, type TeamUpcomingRow } from '@/lib/home/out-today'

const UPCOMING_SHOWN = 6
/** Only upcoming team leave can still be waiting: nobody waiting counts as out today. */
const WAITING = 'Waiting for approval'

interface OutTodayDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  people: OutPerson[]
  teamUpcoming: TeamUpcomingRow[]
}

function TypeDot({ type }: { type: OutPerson['leaveType'] }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={`h-2 w-2 rounded-full ${LEAVE_TYPE_TONE[type].dot}`} />
      {LEAVE_TYPE_LABEL[type]}
    </span>
  )
}

function PersonRow({ person }: { person: OutPerson }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
      <div>
        <p className="text-sm font-medium">{person.name}</p>
        {person.department ? <p className="text-xs text-muted-foreground">{person.department}</p> : null}
      </div>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <TypeDot type={person.leaveType} />
        {person.isHalfDay ? <span>Half day</span> : null}
      </p>
    </li>
  )
}

function UpcomingRow({ row }: { row: TeamUpcomingRow }) {
  const pending = (PENDING_STATUSES as readonly string[]).includes(row.status)
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
      <div>
        <p className="text-sm font-medium">{row.employee.name}</p>
        <p className="text-xs text-muted-foreground">{formatDateRange(row.startDate, row.endDate)}</p>
      </div>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <TypeDot type={row.leaveType} />
        {pending ? <span>{WAITING}</span> : null}
      </p>
    </li>
  )
}

function UpcomingSection({ rows }: { rows: TeamUpcomingRow[] }) {
  const more = rows.length - UPCOMING_SHOWN
  return (
    <section>
      <h3 className="text-sm font-medium text-muted-foreground">Your team’s upcoming leave</h3>
      <ul className="divide-y divide-border/70">
        {rows.slice(0, UPCOMING_SHOWN).map((row) => (
          <UpcomingRow key={row.id} row={row} />
        ))}
      </ul>
      {more > 0 ? (
        <Link href="/leave" className="mt-2 inline-block text-sm text-primary hover:underline">
          and {more} more on the Time off page
        </Link>
      ) : null}
    </section>
  )
}

export function OutTodayDialog({ open, onOpenChange, people, teamUpcoming }: OutTodayDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Out today</DialogTitle>
        </DialogHeader>
        {people.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is out today.</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {people.map((p) => (
              <PersonRow key={p.id} person={p} />
            ))}
          </ul>
        )}
        {teamUpcoming.length > 0 ? <UpcomingSection rows={teamUpcoming} /> : null}
      </DialogContent>
    </Dialog>
  )
}
