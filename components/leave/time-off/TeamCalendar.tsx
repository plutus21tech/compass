'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
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
import { LEAVE_TYPES, type CalendarEvent, type DirectoryUser } from '@/lib/time-off/types'
import { CalendarDayCell } from './CalendarDayCell'
import { DayLeaveDialog } from './DayLeaveDialog'
import { LEAVE_TYPE_STYLE } from './leave-style'

export interface TeamCalendarProps {
  year: number
  month: number
  onMonthChange: (year: number, month: number) => void
  events: CalendarEvent[]
  holidays: CalendarHoliday[]
  birthdays: CalendarBirthday[]
  users: DirectoryUser[]
  viewerDepartment: string | null
  departmentFilter: string
  onDepartmentFilterChange: (value: string) => void
  selection: { start: string; end: string } | null
  onRangeCommit: (range: { start: string; end: string }) => void
  panelOpen: boolean
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const IDLE: RangeState = { phase: 'idle' }
const SEGMENT = 'rounded-md px-3 py-1 text-sm transition-colors'

function dayKeyOf(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  return target.closest<HTMLElement>('[data-day]')?.dataset.day ?? null
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + month + delta
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 }
}

function Hint({ phase, panelOpen, onCancel }: { phase: RangeState['phase']; panelOpen: boolean; onCancel: () => void }) {
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
  if (panelOpen) {
    return (
      <p className="text-sm text-muted-foreground">
        <strong className="font-medium text-primary">Drag again</strong> to change the dates.
      </p>
    )
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

  const cells = useMemo(
    () =>
      buildDayCells(
        buildMonthGrid(year, month),
        filterEventsByDepartment(events, departmentFilter),
        localDayKey(new Date())
      ),
    [year, month, events, departmentFilter]
  )
  const departments = useMemo(() => calendarDepartments(users, events), [users, events])
  const selectableKeys = useMemo(() => new Set(cells.filter((c) => c.selectable).map((c) => c.key)), [cells])
  const selectableRef = useRef(selectableKeys)
  selectableRef.current = selectableKeys
  const commitRef = useRef(onRangeCommit)
  commitRef.current = onRangeCommit

  const dispatch = useCallback((event: RangeEvent) => {
    const result = reduceRange(rangeRef.current, event, (key) => selectableRef.current.has(key))
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

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const key = dayKeyOf(e.target)
    if (!key) return
    const target = e.target as Element
    if (target.hasPointerCapture?.(e.pointerId)) target.releasePointerCapture(e.pointerId)
    dispatch({ type: 'down', key })
  }
  const onPointerOver = (e: PointerEvent<HTMLDivElement>) => {
    const key = dayKeyOf(e.target)
    if (key) dispatch({ type: 'enter', key })
  }
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const key = dayKeyOf(e.target)
    if (key) dispatch({ type: 'up', key })
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const key = dayKeyOf(e.target)
    // Only the cell itself; keys on the "+N more" button keep their own behaviour.
    if (!key || (e.target as HTMLElement).dataset.day !== key) return
    e.preventDefault()
    dispatch({ type: 'down', key })
    dispatch({ type: 'up', key })
  }

  const highlight = range.phase === 'idle' ? selection : previewRange(range)
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
        <Hint phase={range.phase} panelOpen={panelOpen} onCancel={() => dispatch({ type: 'cancel' })} />
      </div>
      <Legend />

      <div className="overflow-hidden rounded-xl border-l border-t border-border bg-card">
        <div
          role="grid"
          aria-label="Team leave calendar"
          onPointerDown={onPointerDown}
          onPointerOver={onPointerOver}
          onPointerUp={onPointerUp}
          onKeyDown={onKeyDown}
        >
          <div role="row" className="grid grid-cols-7">
            {WEEKDAYS.map((day) => (
              <div key={day} role="columnheader" className="border-b border-r border-border px-2 py-2 text-xs font-medium text-muted-foreground">
                {day}
              </div>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0].key} role="row" className="grid grid-cols-7">
              {week.map((cell) => (
                <CalendarDayCell
                  key={cell.key}
                  cell={cell}
                  holidays={holidays.filter((h) => h.date.slice(0, 10) === cell.key)}
                  birthdays={cell.inMonth ? birthdays.filter((b) => b.day === cell.day) : []}
                  selected={Boolean(highlight && cell.inMonth && cell.key >= highlight.start && cell.key <= highlight.end)}
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
