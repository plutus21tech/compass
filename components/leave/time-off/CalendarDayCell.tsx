'use client'

import { CalendarDayMarkers, type CalendarBirthday, type CalendarHoliday } from '@/components/leave/CalendarDayMarkers'
import type { DayCell } from '@/lib/time-off/calendar-grid'
import type { CalendarEvent } from '@/lib/time-off/types'
import { halfDaySessionLabel, LEAVE_TYPE_STYLE } from './leave-style'

interface CalendarDayCellProps {
  cell: DayCell
  holidays: CalendarHoliday[]
  birthdays: CalendarBirthday[]
  selected: boolean
  onMoreClick: (cell: DayCell) => void
}

const PENDING_STATUSES = new Set(['PENDING', 'LEAD_APPROVED', 'HR_APPROVED'])

function chipName(event: CalendarEvent): string {
  return event.isCurrentUser ? 'You' : event.employeeName.trim().split(/\s+/)[0] || event.employeeName
}

function chipTitle(event: CalendarEvent): string {
  const name = event.isCurrentUser ? 'You' : event.employeeName
  const session = event.isHalfDay ? ` (${halfDaySessionLabel(event.halfDaySession)})` : ''
  return `${name} - ${LEAVE_TYPE_STYLE[event.leaveType].label}${session}`
}

function LeaveChip({ event }: { event: CalendarEvent }) {
  const classes = [
    'truncate rounded px-1.5 py-0.5 text-[11px] font-medium leading-4',
    LEAVE_TYPE_STYLE[event.leaveType].chip,
    PENDING_STATUSES.has(event.status) ? 'opacity-60' : '',
    event.isCurrentUser ? 'ring-1 ring-primary' : '',
  ]
  const text = `${chipName(event)}${event.isHalfDay ? ' ½' : ''}`
  return (
    <div className={classes.filter(Boolean).join(' ')} title={chipTitle(event)}>
      {text}
    </div>
  )
}

export function CalendarDayCell({ cell, holidays, birthdays, selected, onMoreClick }: CalendarDayCellProps) {
  const classes = [
    'flex min-h-[7rem] flex-col gap-1 border-b border-r border-border p-1.5 text-left outline-none',
    'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
    cell.selectable ? 'cursor-pointer select-none' : '',
    selected ? 'bg-primary/10 ring-2 ring-inset ring-primary' : cell.isWeekend ? 'bg-muted/40' : 'bg-card',
    cell.isPast || !cell.inMonth ? 'opacity-50' : '',
  ]
  const outClass = cell.busy
    ? 'font-semibold text-amber-700 dark:text-amber-300'
    : 'text-muted-foreground'

  return (
    <div
      role="gridcell"
      data-day={cell.key}
      aria-selected={selected}
      aria-disabled={!cell.selectable}
      tabIndex={cell.selectable ? 0 : -1}
      className={classes.filter(Boolean).join(' ')}
    >
      <div className="flex items-center justify-between gap-1 text-xs">
        <span
          className={
            cell.isToday
              ? 'inline-flex h-6 min-w-6 items-center justify-center px-1 font-semibold bg-foreground text-background rounded-full'
              : 'px-1 font-medium text-muted-foreground'
          }
        >
          {cell.day}
        </span>
        {cell.outCount > 0 && <span className={outClass}>{`${cell.outCount} out`}</span>}
      </div>
      {cell.inMonth && <CalendarDayMarkers holidays={holidays} birthdays={birthdays} />}
      <div className="space-y-1">
        {cell.visible.map((event) => (
          <LeaveChip key={`${event.id}-${event.employeeId}`} event={event} />
        ))}
      </div>
      {cell.moreCount > 0 && (
        <button
          type="button"
          className="self-start rounded px-1 text-[11px] text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onMoreClick(cell)
          }}
        >
          {`+${cell.moreCount} more`}
        </button>
      )}
    </div>
  )
}
