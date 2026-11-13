'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { CalendarBirthday, CalendarHoliday } from '@/components/leave/CalendarDayMarkers'
import type { OutTodayView } from '@/lib/home/out-today'
import {
  loadCalendarMonth, loadOutToday, loadTimeOff,
  type TimeOffSnapshot,
} from '@/lib/time-off/api'
import { monthsBetween } from '@/lib/time-off/calendar-grid'
import { notePublicHolidayFailures } from '@/lib/time-off/holiday-warnings'
import type { CalendarEvent } from '@/lib/time-off/types'

const EMPTY_SNAPSHOT: TimeOffSnapshot = {
  balance: null,
  requests: [],
  users: [],
  approvals: [],
  wfhRequests: [],
  wfhApprovals: [],
}

const HOLIDAY_ERROR = 'Could not load holidays for the summary.'

interface CalendarState {
  year: number
  month: number
  events: CalendarEvent[]
  holidays: CalendarHoliday[]
  birthdays: CalendarBirthday[]
}

const cacheKey = (year: number, month: number) => `${year}-${month}`
const holidayDayKeys = (holidays: CalendarHoliday[]): string[] => holidays.map((h) => h.date.slice(0, 10))

export function useTimeOffData(enabled: boolean) {
  const [loading, setLoading] = useState(true)
  const [snapshot, setSnapshot] = useState<TimeOffSnapshot>(EMPTY_SNAPSHOT)
  // Who is out today comes from Home's source, not the month being viewed, so both pages agree.
  const [outToday, setOutToday] = useState<OutTodayView | null>(null)
  const [calendar, setCalendar] = useState<CalendarState>(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth(), events: [], holidays: [], birthdays: [] }
  })
  const [calendarError, setCalendarError] = useState(false)
  const holidayCache = useRef<Map<string, string[]>>(new Map())
  const warnedHolidayMonths = useRef<ReadonlySet<string>>(new Set())
  const target = useRef({ year: calendar.year, month: calendar.month })

  const reload = useCallback(async () => {
    const [result, out] = await Promise.all([loadTimeOff(), loadOutToday()])
    if (result.ok) setSnapshot(result.data)
    else toast.error(result.error)
    if (out.ok) setOutToday(out.data)
    else console.error('Out today load failed:', out.error)
    setLoading(false)
  }, [])

  const fetchCalendar = useCallback(async (year: number, month: number) => {
    const result = await loadCalendarMonth(year, month)
    if (!result.ok) {
      console.error('Calendar load failed:', result.error)
      if (target.current.year === year && target.current.month === month) setCalendarError(true)
      return
    }
    holidayCache.current.set(cacheKey(year, month), holidayDayKeys(result.data.holidays))
    // Ignore a response for a month the user has already navigated away from.
    if (target.current.year !== year || target.current.month !== month) return
    setCalendarError(false)
    setCalendar({ year, month, ...result.data })
  }, [])

  const reloadCalendar = useCallback(
    () => fetchCalendar(target.current.year, target.current.month),
    [fetchCalendar],
  )

  const setMonth = useCallback((year: number, month: number) => {
    target.current = { year, month }
    setCalendar((prev) => ({ ...prev, year, month }))
  }, [])

  useEffect(() => {
    if (!enabled) return
    void reload()
  }, [enabled, reload])

  useEffect(() => {
    if (!enabled) return
    void fetchCalendar(calendar.year, calendar.month)
  }, [enabled, calendar.year, calendar.month, fetchCalendar])

  const holidayKeysFor = useCallback(async (startKey: string, endKey: string): Promise<Set<string>> => {
    const months = monthsBetween(startKey, endKey)
    const missing = months.filter((m) => !holidayCache.current.has(cacheKey(m.year, m.month)))
    const results = await Promise.all(missing.map((m) => loadCalendarMonth(m.year, m.month)))
    const failedMonths: string[] = []
    results.forEach((r, i) => {
      const key = cacheKey(missing[i].year, missing[i].month)
      if (r.ok) holidayCache.current.set(key, holidayDayKeys(r.data.holidays))
      else failedMonths.push(key)
    })
    const noted = notePublicHolidayFailures(warnedHolidayMonths.current, failedMonths)
    warnedHolidayMonths.current = noted.warned
    if (noted.warn) toast.error(HOLIDAY_ERROR)
    const keys = new Set<string>()
    for (const m of months) {
      for (const key of holidayCache.current.get(cacheKey(m.year, m.month)) ?? []) keys.add(key)
    }
    return keys
  }, [])

  return { loading, snapshot, outToday, reload, calendar, calendarError, setMonth, reloadCalendar, holidayKeysFor }
}
