'use client'

import { CalendarOff } from 'lucide-react'
import type { CalendarHoliday } from '@/components/leave/CalendarDayMarkers'
import { SoftState } from '@/components/composed/SoftState'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format-date'
import type { CalendarEvent } from '@/lib/time-off/types'
import { DayPeopleList } from './DayPeopleList'

interface DayDetailsProps {
  dayKey: string
  todayKey: string
  /** Leave on this day, already narrowed to the calendar's department filter. */
  events: readonly CalendarEvent[]
  /** The viewer's holidays on this day. */
  holidays: readonly CalendarHoliday[]
  /**
   * For today: Home's "out today" count (approved leave, the viewer left out), so both pages
   * always say the same number. Other days count approved colleagues from the calendar.
   */
  outCount?: number | null
  onRequest: (dayKey: string) => void
}

/** Colleagues with approved leave; pending requests and the viewer's own leave are not "out". */
export function approvedOthers(events: readonly CalendarEvent[]): number {
  return new Set(events.filter((e) => e.status === 'APPROVED' && !e.isCurrentUser).map((e) => e.employeeId)).size
}

export function isWeekendKey(dayKey: string): boolean {
  const dow = new Date(`${dayKey}T00:00:00Z`).getUTCDay()
  return dow === 0 || dow === 6
}

function countLine(count: number): string {
  if (count === 0) return 'Nobody out'
  return count === 1 ? '1 person out' : `${count} people out`
}

/** The side panel's default view: who is out on the chosen day, and a way to request leave from it. */
export function DayDetails({ dayKey, todayKey, events, holidays, outCount, onRequest }: DayDetailsProps) {
  const weekend = isWeekendKey(dayKey)
  const label = formatDate(dayKey)
  const people = outCount ?? approvedOthers(events)
  const canRequest = !weekend && dayKey >= todayKey

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">{label}</h3>
        <p className="text-xs text-muted-foreground">
          {dayKey === todayKey ? 'Today · ' : ''}
          {weekend ? 'Weekend' : countLine(people)}
        </p>
      </div>

      {holidays.map((holiday) => (
        <p key={holiday.id} className="rounded-lg bg-cyan-50 px-3 py-2 text-sm text-cyan-800 dark:bg-cyan-500/10 dark:text-cyan-200">
          <span className="font-semibold">{holiday.name}.</span> Public holiday, office closed.
        </p>
      ))}

      {weekend ? (
        <SoftState icon={CalendarOff} title="Weekend" description="Not a working day." />
      ) : events.length === 0 ? (
        holidays.length === 0 && <SoftState tone="success" title={`Everyone's in on ${label}`} />
      ) : (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">Leave on this day</h4>
          <DayPeopleList events={events} />
        </div>
      )}

      {canRequest && (
        <Button type="button" variant="outline" className="mt-auto w-full" onClick={() => onRequest(dayKey)}>
          Request leave from this day
        </Button>
      )}
    </div>
  )
}
