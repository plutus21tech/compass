import { Users } from 'lucide-react'
import type { CalendarEvent } from '@/lib/time-off/types'
import { halfDaySessionLabel, LEAVE_TYPE_STYLE } from './leave-style'

export function OutTodayCard({ events }: { events: CalendarEvent[] }) {
  if (events.length === 0) return null
  return (
    <section className="rounded-2xl border border-border bg-card">
      <h2 className="flex items-center gap-2 border-b border-border p-4 font-display font-semibold text-foreground">
        <Users className="h-4 w-4" aria-hidden />
        Out today
      </h2>
      <ul className="space-y-2 p-3">
        {events.map((event) => {
          const type = LEAVE_TYPE_STYLE[event.leaveType]
          return (
            <li key={event.id} className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${type.dot}`} aria-hidden />
              <span className="text-foreground">{event.employeeName}</span>
              <span className="text-xs text-muted-foreground">
                ({type.label}
                {event.isHalfDay ? `, ${halfDaySessionLabel(event.halfDaySession)}` : ''})
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
