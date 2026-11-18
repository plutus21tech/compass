import { UserAvatar } from '@/components/composed/UserAvatar'
import { PersonLink } from '@/components/people/PersonLink'
import { isWaiting, returnDateLabel, sortByReturn } from '@/lib/time-off/day-details'
import type { CalendarEvent } from '@/lib/time-off/types'
import { halfDaySessionLabel, halfDayWindowLabel, LEAVE_TYPE_STYLE } from './leave-style'

function backText(event: CalendarEvent): string {
  if (event.isHalfDay) return 'back the same day'
  const back = returnDateLabel(event)
  return back ? `back ${back}` : ''
}

/** Who is out on one day: avatar, team, when they are back and the leave type, soonest back first. */
export function DayPeopleList({ events }: { events: readonly CalendarEvent[] }) {
  return (
    <ul className="space-y-2">
      {sortByReturn(events).map((event) => {
        const type = LEAVE_TYPE_STYLE[event.leaveType]
        const facts = [event.department, backText(event)].filter(Boolean).join(' · ')
        return (
          <li
            key={`${event.id}-${event.employeeId}`}
            className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
          >
            <UserAvatar name={event.employeeName} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                <PersonLink personId={event.employeeId}>{event.isCurrentUser ? 'You' : event.employeeName}</PersonLink>
              </p>
              {facts && <p className="truncate text-xs text-muted-foreground">{facts}</p>}
              {event.isHalfDay && (
                <p className="truncate text-[11px] text-muted-foreground">
                  {halfDaySessionLabel(event.halfDaySession)} · {halfDayWindowLabel(event.unavailableStartTime, event.unavailableEndTime)}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${type.chip}`}>{type.label}</span>
              {isWaiting(event.status) && <span className="text-[11px] text-amber-700 dark:text-amber-300">Pending</span>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
