'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CalendarHoliday } from '@/components/leave/CalendarDayMarkers'
import { Skeleton } from '@/components/ui/skeleton'
import { othersOutToday, type OutTodayView } from '@/lib/home/out-today'
import { eventsOnDay, filterEventsByDepartment } from '@/lib/time-off/calendar-grid'
import { isWaiting } from '@/lib/time-off/day-details'
import type { CalendarEvent, LeaveRequest } from '@/lib/time-off/types'
import { DayDetails, isWeekendKey } from './DayDetails'
import { MyRequests } from './MyRequests'
import { SidePanel, type SideTab } from './SidePanel'

export interface SideColumnState {
  dayKey: string
  tab: SideTab
  setTab: (tab: SideTab) => void
  /** Show one day's details (a click on the calendar). */
  showDay: (dayKey: string) => void
}

/** Which day and which tab the calendar's right-hand panel shows; it starts on today. */
export function useSideColumn(todayKey: string): SideColumnState {
  const [dayKey, setDayKey] = useState(todayKey)
  const [tab, setTab] = useState<SideTab>('day')
  // /leave#my-requests (Home's History link) opens the My requests tab, which the page then scrolls to.
  useEffect(() => {
    if (window.location.hash === '#my-requests') setTab('requests')
  }, [])
  const showDay = useCallback((key: string) => {
    setDayKey(key)
    setTab('day')
  }, [])
  return { dayKey, tab, setTab, showDay }
}

interface CalendarSideColumnProps {
  loading: boolean
  side: SideColumnState
  todayKey: string
  events: CalendarEvent[]
  holidays: CalendarHoliday[]
  departmentFilter: string
  requests: LeaveRequest[]
  /** Home's "out today"; null until it loads. */
  outToday: OutTodayView | null
  viewerId: string
  onRequestFromDay: (dayKey: string) => void
  onRequestLeave: () => void
  onView: (r: LeaveRequest) => void
  onEdit: (r: LeaveRequest) => void
  onCancel: (r: LeaveRequest) => void
}

/** The calendar's right-hand column while no request form is open: day details and the viewer's requests. */
export function CalendarSideColumn(props: CalendarSideColumnProps) {
  const { side, todayKey, departmentFilter } = props
  if (props.loading) return <Skeleton className="h-96 rounded-xl" aria-hidden="true" />

  const { dayKey } = side
  const dayEvents = isWeekendKey(dayKey) ? [] : eventsOnDay(filterEventsByDepartment(props.events, departmentFilter), dayKey)
  const dayHolidays = props.holidays.filter((h) => h.date.slice(0, 10) === dayKey)
  // Today's count comes from the same source as Home, so the two pages never disagree.
  const todayOutCount =
    dayKey === todayKey && departmentFilter === 'ALL' && props.outToday
      ? othersOutToday(props.outToday, props.viewerId).count
      : null

  return (
    <SidePanel
      tab={side.tab}
      onTabChange={side.setTab}
      dayKey={dayKey}
      todayKey={todayKey}
      waitingCount={props.requests.filter((r) => isWaiting(r.status)).length}
      day={
        <DayDetails
          dayKey={dayKey}
          todayKey={todayKey}
          events={dayEvents}
          holidays={dayHolidays}
          outCount={todayOutCount}
          onRequest={props.onRequestFromDay}
        />
      }
      requests={
        <MyRequests
          requests={props.requests}
          onView={props.onView}
          onEdit={props.onEdit}
          onCancel={props.onCancel}
          onRequestLeave={props.onRequestLeave}
        />
      }
    />
  )
}
