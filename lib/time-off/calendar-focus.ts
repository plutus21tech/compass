import type { DayCell } from './calendar-grid'

/**
 * Roving tabindex for the team calendar: one day is the grid's tab stop and the arrow keys move
 * focus between pickable days, so Tab does not walk through every future day of the month.
 */
const STEP: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

type FocusCell = Pick<DayCell, 'key' | 'selectable' | 'isToday'>

const pickable = (cells: readonly FocusCell[], key: string | null): boolean =>
  key !== null && cells.some((c) => c.key === key && c.selectable)

/** The one tabbable day: the last focused day, else the selection start, else today, else the first pickable day. */
export function rovingFocusKey(cells: readonly FocusCell[], focused: string | null, selectionStart: string | null): string | null {
  if (pickable(cells, focused)) return focused
  if (pickable(cells, selectionStart)) return selectionStart
  const today = cells.find((c) => c.isToday && c.selectable)
  if (today) return today.key
  return cells.find((c) => c.selectable)?.key ?? null
}

/** The day an arrow key moves focus to, or null when the key is not an arrow or the target cannot be picked. */
export function moveFocusKey(cells: readonly FocusCell[], from: string, key: string): string | null {
  const step = STEP[key]
  if (step === undefined) return null
  const index = cells.findIndex((c) => c.key === from)
  const target = index === -1 ? undefined : cells[index + step]
  return target?.selectable ? target.key : null
}
