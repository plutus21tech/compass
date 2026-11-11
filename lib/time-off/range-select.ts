export type RangeState =
  | { phase: 'idle' }
  | { phase: 'dragging'; anchor: string; current: string }
  | { phase: 'picking-end'; anchor: string }

export type RangeEvent = { type: 'down' | 'enter' | 'up'; key: string } | { type: 'cancel' }

export interface RangeResult {
  state: RangeState
  commit: { start: string; end: string } | null
}

const IDLE: RangeState = { phase: 'idle' }

const ordered = (a: string, b: string): { start: string; end: string } =>
  a <= b ? { start: a, end: b } : { start: b, end: a }

export function reduceRange(
  state: RangeState,
  event: RangeEvent,
  selectable: (key: string) => boolean
): RangeResult {
  const keep: RangeResult = { state, commit: null }
  if (event.type === 'cancel') return { state: IDLE, commit: null }

  if (event.type === 'down') {
    if (!selectable(event.key)) return keep
    if (state.phase === 'picking-end') {
      if (event.key >= state.anchor) {
        return { state: IDLE, commit: { start: state.anchor, end: event.key } }
      }
      return { state: { phase: 'picking-end', anchor: event.key }, commit: null }
    }
    return { state: { phase: 'dragging', anchor: event.key, current: event.key }, commit: null }
  }

  if (state.phase !== 'dragging') return keep

  if (event.type === 'enter') {
    if (!selectable(event.key)) return keep
    return { state: { ...state, current: event.key }, commit: null }
  }

  // up
  if (state.current !== state.anchor) {
    return { state: IDLE, commit: ordered(state.anchor, state.current) }
  }
  return { state: { phase: 'picking-end', anchor: state.anchor }, commit: null }
}

export function previewRange(state: RangeState): { start: string; end: string } | null {
  if (state.phase === 'dragging') return ordered(state.anchor, state.current)
  if (state.phase === 'picking-end') return { start: state.anchor, end: state.anchor }
  return null
}
