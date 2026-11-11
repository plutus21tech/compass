import { Users } from 'lucide-react'
import { othersOutToday, type OutTodayView } from '@/lib/home/out-today'
import { halfDaySessionLabel, LEAVE_TYPE_STYLE } from './leave-style'

interface OutTodayCardProps {
  /** Home's `outToday` (approved leave on the Karachi day); null until it loads. */
  outToday: OutTodayView | null
  /** Left out of the count and the list, exactly as on Home. */
  viewerId: string
}

export function OutTodayCard({ outToday, viewerId }: OutTodayCardProps) {
  if (!outToday) return null
  const { count, people } = othersOutToday(outToday, viewerId)
  if (count === 0) return null
  return (
    <section className="rounded-2xl border border-border bg-card">
      <h2 className="flex items-center gap-2 border-b border-border p-4 font-display font-semibold text-foreground">
        <Users className="h-4 w-4" aria-hidden />
        Out today
        <span
          className="ml-auto text-sm font-normal tabular-nums text-muted-foreground"
          aria-label={`${count} ${count === 1 ? 'person' : 'people'} out today`}
        >
          {count}
        </span>
      </h2>
      <ul className="space-y-2 p-3">
        {people.map((person) => {
          const type = LEAVE_TYPE_STYLE[person.leaveType]
          return (
            <li key={person.id} className="flex items-center gap-2 text-sm">
              <span className={`h-2 w-2 rounded-full ${type.dot}`} aria-hidden />
              <span className="text-foreground">{person.name}</span>
              <span className="text-xs text-muted-foreground">
                ({type.label}
                {person.isHalfDay ? `, ${halfDaySessionLabel(person.halfDaySession)}` : ''})
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
