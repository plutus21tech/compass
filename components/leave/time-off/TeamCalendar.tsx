'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { CalendarMarkerLegend, type CalendarBirthday, type CalendarHoliday } from '@/components/leave/CalendarDayMarkers'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatMonthYear, localDayKey } from '@/lib/format-date'
import {
  buildDayCells,
  buildMonthGrid,
  calendarDepartments,
  filterEventsByDepartment,
  type DayCell,
} from '@/lib/time-off/calendar-grid'
import { previewRange, reduceRange, type RangeEvent, type RangeState } from '@/lib/time-off/range-select'
import { reduceTap, type PendingTap, type TapEvent } from '@/lib/time-off/touch-tap'
import { moveFocusKey, rovingFocusKey } from '@/lib/time-off/calendar-focus'
import { LEAVE_TYPES, type CalendarEvent, type DirectoryUser } from '@/lib/time-off/types'
import {
  HOLIDAY_TEAM_MINE,
  visibleBirthdays,
  visibleEvents,
  visibleHolidays,
  type CalendarShow,
  type HolidayTeamOption,
  type TeamHoliday,
} from '@/lib/time-off/calendar-filters'
import { CalendarDayCell } from './CalendarDayCell'
import { CalendarFilters } from './CalendarFilters'
import { DayLeaveDialog } from './DayLeaveDialog'
import { LEAVE_TYPE_STYLE } from './leave-style'

export interface TeamCalendarProps {
  year: number
  month: number
  onMonthChange: (year: number, month: number) => void
  events: CalendarEvent[]
  holidays: CalendarHoliday[]
  birthdays: CalendarBirthday[]
  /** Every team's holidays and the teams to filter them by; without them only the viewer's show. */
  allHolidays?: TeamHoliday[]
  holidayTeams?: HolidayTeamOption[]
  /** What the calendar shows when it first appears. */
  initialShow?: CalendarShow
  users: DirectoryUser[]
  viewerDepartment: string | null
  departmentFilter: string
  onDepartmentFilterChange: (value: string) => void
  selection: { start: string; end: string } | null
  onRangeCommit: (range: { start: string; end: string }) => void
  panelOpen: boolean
  /**
   * When given, a plain click on a day reports it here (to show that day's details) and only a
   * drag picks dates. While the request form is open a click sets the dates to that one day.
   * Without it, clicking the first and last day picks a range, as before.
   */
  onDayClick?: (dayKey: string) => void
  /** The day whose details are showing, outlined on the grid. */
  activeDay?: string | null
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const IDLE: RangeState = { phase: 'idle' }
const SEGMENT = 'rounded-md px-3 py-1 text-sm transition-colors'

/** Escape abandons a range in progress; it does nothing when idle. */
export function shouldCancelRange(key: string, phase: RangeState['phase']): boolean {
  return key === 'Escape' && phase !== 'idle'
}

function dayKeyOf(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  return target.closest<HTMLElement>('[data-day]')?.dataset.day ?? null
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + month + delta
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 }
}

/** Weekdays share the width; Saturday and Sunday are narrower because nothing is booked on them. */
const WEEK_COLUMNS = 'grid grid-cols-[repeat(5,minmax(0,1fr))_repeat(2,minmax(0,0.55fr))]'

interface HintProps {
  phase: RangeState['phase']
  hasDates: boolean
  /** A click shows the day, so only dragging picks dates. */
  clickShowsDay: boolean
  onCancel: () => void
}

function Hint({ phase, hasDates, clickShowsDay, onCancel }: HintProps) {
  if (phase === 'picking-end') {
    return (
      <p className="text-sm text-muted-foreground">
        Now click your last day off.{' '}
        <button type="button" className="font-medium text-primary hover:underline" onClick={onCancel}>
          Cancel
        </button>
      </p>
    )
  }
  // "Again" only makes sense once the open form has dates.
  if (hasDates) {
    return (
      <p className="text-sm text-muted-foreground">
        <strong className="font-medium text-primary">Drag again</strong> to change the dates.
      </p>
    )
  }
  if (clickShowsDay) {
    return <p className="text-sm text-muted-foreground">Click a day to see who&apos;s out. Drag across days to request leave.</p>
  }
  return <p className="text-sm text-muted-foreground">Drag across days, or click the first and last day off.</p>
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      {LEAVE_TYPES.map((type) => (
        <div key={type} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-sm ${LEAVE_TYPE_STYLE[type].dot}`} aria-hidden="true" />
          <span className="text-muted-foreground">{LEAVE_TYPE_STYLE[type].label}</span>
        </div>
      ))}
      <CalendarMarkerLegend />
      <div className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded bg-muted ring-1 ring-primary" aria-hidden="true" />
        <span className="text-muted-foreground">Your requests</span>
      </div>
    </div>
  )
}

function DepartmentControl({
  value,
  onChange,
  viewerDepartment,
  departments,
}: {
  value: string
  onChange: (value: string) => void
  viewerDepartment: string | null
  departments: string[]
}) {
  const own = viewerDepartment?.trim() || null
  const isOther = value !== 'ALL' && value !== own
  const active = 'bg-background text-foreground shadow-sm'
  const idle = 'text-muted-foreground hover:text-foreground'
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex rounded-lg bg-muted p-0.5" role="group" aria-label="Show leave for">
        <button
          type="button"
          aria-pressed={value === 'ALL'}
          className={`${SEGMENT} ${value === 'ALL' ? active : idle}`}
          onClick={() => onChange('ALL')}
        >
          Everyone
        </button>
        {own && (
          <button
            type="button"
            aria-pressed={value === own}
            className={`${SEGMENT} ${value === own ? active : idle}`}
            onClick={() => onChange(own)}
          >
            {own}
          </button>
        )}
      </div>
      {departments.length > 0 && (
        <Select value={isOther ? value : ''} onValueChange={onChange}>
          <SelectTrigger className="h-8 w-[10.5rem]" aria-label="Other department">
            <SelectValue placeholder="Other department" />
          </SelectTrigger>
          <SelectContent>
            {departments.map((department) => (
              <SelectItem key={department} value={department}>
                {department}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

export function TeamCalendar(props: TeamCalendarProps) {
  const { year, month, onMonthChange, events, holidays, birthdays, users, viewerDepartment } = props
  const { departmentFilter, onDepartmentFilterChange, selection, onRangeCommit, panelOpen } = props

  const [range, setRange] = useState<RangeState>(IDLE)
  const rangeRef = useRef<RangeState>(IDLE)
  const [dialogCell, setDialogCell] = useState<DayCell | null>(null)
  const [focusedDay, setFocusedDay] = useState<string | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  const { allHolidays, holidayTeams } = props
  const [show, setShow] = useState<CalendarShow>(props.initialShow ?? 'ALL')
  const [holidayTeam, setHolidayTeam] = useState<string>(HOLIDAY_TEAM_MINE)
  const shownHolidays = useMemo(
    () => visibleHolidays(show, holidayTeam, holidays, allHolidays ?? [], holidayTeams ?? []),
    [show, holidayTeam, holidays, allHolidays, holidayTeams]
  )
  const shownBirthdays = useMemo(() => visibleBirthdays(show, birthdays), [show, birthdays])

  const cells = useMemo(
    () =>
      buildDayCells(
        buildMonthGrid(year, month),
        visibleEvents(show, filterEventsByDepartment(events, departmentFilter)),
        localDayKey(new Date())
      ),
    [year, month, events, departmentFilter, show]
  )
  const departments = useMemo(() => calendarDepartments(users, events), [users, events])
  // A team filter that leaves nobody (but perhaps the viewer) on leave this month says so, instead of looking empty.
  const quietTeam =
    departmentFilter !== 'ALL' && show !== 'HOLIDAYS' && show !== 'BIRTHDAYS' &&
    !filterEventsByDepartment(events, departmentFilter).some((e) => !e.isCurrentUser)
  const selectableKeys = useMemo(() => new Set(cells.filter((c) => c.selectable).map((c) => c.key)), [cells])
  const selectableRef = useRef(selectableKeys)
  selectableRef.current = selectableKeys
  const commitRef = useRef(onRangeCommit)
  commitRef.current = onRangeCommit

  const dayClickRef = useRef(props.onDayClick)
  dayClickRef.current = props.onDayClick
  const panelOpenRef = useRef(panelOpen)
  panelOpenRef.current = panelOpen
  const inMonthKeys = useMemo(() => new Set(cells.filter((c) => c.inMonth).map((c) => c.key)), [cells])
  // A press on a day that cannot be booked (a past day); released on the same day it is a click.
  const pastPressRef = useRef<string | null>(null)

  const dispatch = useCallback((event: RangeEvent) => {
    const before = rangeRef.current
    const result = reduceRange(before, event, (key) => selectableRef.current.has(key))
    // Press and release on one day is a click: show that day instead of starting a click-click range.
    if (dayClickRef.current && before.phase === 'dragging' && result.state.phase === 'picking-end') {
      const day = result.state.anchor
      rangeRef.current = IDLE
      setRange(IDLE)
      if (panelOpenRef.current) commitRef.current({ start: day, end: day })
      else dayClickRef.current(day)
      return
    }
    rangeRef.current = result.state
    setRange(result.state)
    if (result.commit) commitRef.current(result.commit)
  }, [])

  const dragging = range.phase === 'dragging'
  useEffect(() => {
    if (!dragging) return undefined
    // A release or cancel outside the grid must still end the drag.
    const onUp = () => {
      const current = rangeRef.current
      if (current.phase === 'dragging') dispatch({ type: 'up', key: current.current })
    }
    const onCancel = () => dispatch({ type: 'cancel' })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [dragging, dispatch])

  const active = range.phase !== 'idle'
  useEffect(() => {
    if (!active) return undefined
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (shouldCancelRange(e.key, rangeRef.current.phase)) dispatch({ type: 'cancel' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, dispatch])

  // Touch/pen second taps wait for pointerup so a scroll that starts on a day never commits it.
  const tapRef = useRef<PendingTap | null>(null)
  const tap = (event: TapEvent) => {
    const result = reduceTap(tapRef.current, event)
    tapRef.current = result.pending
    if (result.down) dispatch({ type: 'down', key: result.down })
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const key = dayKeyOf(e.target)
    if (!key) return
    pastPressRef.current = !selectableRef.current.has(key) && inMonthKeys.has(key) ? key : null
    const target = e.target as Element
    if (target.hasPointerCapture?.(e.pointerId)) target.releasePointerCapture(e.pointerId)
    const { pointerType, pointerId, clientX: x, clientY: y } = e
    tap({ type: 'down', pointerType, phase: rangeRef.current.phase, pointerId, key, x, y })
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (tapRef.current) tap({ type: 'move', pointerId: e.pointerId, x: e.clientX, y: e.clientY })
  }
  const onPointerCancel = (e: PointerEvent<HTMLDivElement>) => tap({ type: 'cancel', pointerId: e.pointerId })
  const onPointerOver = (e: PointerEvent<HTMLDivElement>) => {
    const key = dayKeyOf(e.target)
    if (key) dispatch({ type: 'enter', key })
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    tap({ type: 'up', pointerId: e.pointerId })
    const key = dayKeyOf(e.target)
    const pastPress = pastPressRef.current
    pastPressRef.current = null
    // Past days cannot be booked, but you can still look at who was out.
    if (key && pastPress === key && !panelOpenRef.current) dayClickRef.current?.(key)
    if (key) dispatch({ type: 'up', key })
  }
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const key = (e.target as HTMLElement).dataset.day
    if (key) setFocusedDay(key)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const key = dayKeyOf(e.target)
    // Only the cell itself; keys on the "+N more" button keep their own behaviour.
    if (!key || (e.target as HTMLElement).dataset.day !== key) return
    const nextKey = moveFocusKey(cells, key, e.key)
    if (nextKey) {
      e.preventDefault()
      setFocusedDay(nextKey)
      gridRef.current?.querySelector<HTMLElement>(`[data-day="${nextKey}"]`)?.focus()
      return
    }
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    dispatch({ type: 'down', key })
    dispatch({ type: 'up', key })
  }

  const highlight = range.phase === 'idle' ? selection : previewRange(range)
  const tabStop = rovingFocusKey(cells, focusedDay, selection?.start ?? null)
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
  const prev = shiftMonth(year, month, -1)
  const next = shiftMonth(year, month, 1)
  const iconButton =
    'inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground'

  return (
    <section className="space-y-3" aria-label="Team calendar">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Previous month" className={iconButton} onClick={() => onMonthChange(prev.year, prev.month)}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Next month" className={iconButton} onClick={() => onMonthChange(next.year, next.month)}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <h2 className="text-lg font-semibold text-foreground">{formatMonthYear(`${year}-${String(month + 1).padStart(2, '0')}-01`)}</h2>
        <DepartmentControl
          value={departmentFilter}
          onChange={onDepartmentFilterChange}
          viewerDepartment={viewerDepartment}
          departments={departments}
        />
        <div aria-live="polite">
          <Hint
            phase={range.phase}
            hasDates={panelOpen && selection !== null}
            clickShowsDay={props.onDayClick !== undefined}
            onCancel={() => dispatch({ type: 'cancel' })}
          />
        </div>
      </div>
      <CalendarFilters
        show={show}
        onShowChange={setShow}
        holidayTeam={holidayTeam}
        onHolidayTeamChange={setHolidayTeam}
        holidayTeams={holidayTeams ?? []}
      />
      <Legend />
      {quietTeam && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            No one in {departmentFilter} is out in {formatMonthYear(`${year}-${String(month + 1).padStart(2, '0')}-01`)}.
          </span>{' '}
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => onDepartmentFilterChange('ALL')}>
            Show everyone
          </button>
        </p>
      )}

      <div className="overflow-hidden rounded-xl border-l border-t border-border bg-card">
        <div
          ref={gridRef}
          role="grid"
          aria-label="Team leave calendar"
          onFocus={onFocus}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerCancel={onPointerCancel}
          onPointerOver={onPointerOver}
          onPointerUp={onPointerUp}
          onKeyDown={onKeyDown}
        >
          <div role="row" className={WEEK_COLUMNS}>
            {WEEKDAYS.map((day) => (
              <div key={day} role="columnheader" className="border-b border-r border-border px-2 py-2 text-xs font-medium text-muted-foreground">
                {day}
              </div>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0].key} role="row" className={WEEK_COLUMNS}>
              {week.map((cell) => (
                <CalendarDayCell
                  key={cell.key}
                  cell={cell}
                  holidays={shownHolidays.filter((h) => h.date.slice(0, 10) === cell.key)}
                  birthdays={cell.inMonth ? shownBirthdays.filter((b) => b.day === cell.day) : []}
                  selected={Boolean(highlight && cell.inMonth && cell.key >= highlight.start && cell.key <= highlight.end)}
                  tabbable={cell.key === tabStop}
                  active={!panelOpen && cell.inMonth && cell.key === props.activeDay}
                  onMoreClick={setDialogCell}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <DayLeaveDialog
        open={dialogCell !== null}
        dayKey={dialogCell?.key ?? null}
        events={dialogCell?.events ?? []}
        onClose={() => setDialogCell(null)}
      />
    </section>
  )
}
