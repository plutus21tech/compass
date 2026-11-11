import type { RangeState } from './range-select'

/**
 * On touch and pen, the second tap of a click-click range must not act on pointerdown: the
 * finger may be starting a scroll. It is held as a pending tap and only becomes a range "down"
 * on pointerup, if the pointer stayed within TAP_SLOP_PX and the browser did not cancel it.
 * Mouse presses (and touches that start a drag from idle) pass straight through.
 */
export const TAP_SLOP_PX = 10

export interface PendingTap {
  pointerId: number
  key: string
  x: number
  y: number
}

export type TapEvent =
  | { type: 'down'; pointerType: string; phase: RangeState['phase']; pointerId: number; key: string; x: number; y: number }
  | { type: 'move'; pointerId: number; x: number; y: number }
  | { type: 'cancel'; pointerId: number }
  | { type: 'up'; pointerId: number }

export interface TapResult {
  pending: PendingTap | null
  /** A day to send to the range reducer as `down` now, or null. */
  down: string | null
}

const movedTooFar = (tap: PendingTap, x: number, y: number): boolean =>
  Math.hypot(x - tap.x, y - tap.y) > TAP_SLOP_PX

export function reduceTap(pending: PendingTap | null, event: TapEvent): TapResult {
  if (event.type === 'down') {
    if (event.pointerType === 'mouse' || event.phase !== 'picking-end') return { pending: null, down: event.key }
    return { pending: { pointerId: event.pointerId, key: event.key, x: event.x, y: event.y }, down: null }
  }
  if (!pending || pending.pointerId !== event.pointerId) return { pending, down: null }
  if (event.type === 'move') {
    return movedTooFar(pending, event.x, event.y) ? { pending: null, down: null } : { pending, down: null }
  }
  if (event.type === 'cancel') return { pending: null, down: null }
  return { pending: null, down: pending.key }
}
