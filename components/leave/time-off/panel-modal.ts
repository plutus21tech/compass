'use client'

import { useEffect, useState, type KeyboardEvent } from 'react'

/** Below Tailwind's `lg` the request panel is a full-screen modal layer. */
export const SMALL_SCREEN_QUERY = '(max-width: 1023px)'

/** Focus is contained and the page behind locked only while open on a small screen. */
export function shouldTrapFocus(isSmallScreen: boolean, open: boolean): boolean {
  return isSmallScreen && open
}

/**
 * Where Tab should wrap to inside a trap of `count` focusable elements. `index` is the focused
 * element's position, or -1 when focus sits before the first one (e.g. on the panel heading).
 * null = let the browser move focus normally.
 */
export function wrapFocusIndex(count: number, index: number, backwards: boolean): number | null {
  if (count === 0) return null
  if (backwards) return index <= 0 ? count - 1 : null
  return index === count - 1 ? 0 : null
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Node.DOCUMENT_POSITION_FOLLOWING, spelled out so this module also loads outside a browser. */
const POSITION_FOLLOWING = 4

/** The parts of a keydown event the trap reads (a React KeyboardEvent fits). */
export type TrapKeyEvent = Pick<KeyboardEvent<HTMLElement>, 'key' | 'shiftKey' | 'defaultPrevented' | 'target' | 'preventDefault'>

/**
 * Tab / Shift+Tab handler that keeps focus cycling inside `container`. It leaves alone keys
 * another layer already handled and keys from portalled content (e.g. an open Radix Select),
 * whose events bubble through React but whose DOM target is outside the panel.
 */
export function trapTabKey(
  e: TrapKeyEvent,
  container: HTMLElement | null,
  doc: Pick<Document, 'activeElement'> | undefined = typeof document === 'undefined' ? undefined : document
): void {
  if (e.key !== 'Tab' || !container || !doc) return
  if (e.defaultPrevented || !container.contains(e.target as Node)) return
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getAttribute('aria-hidden') !== 'true'
  )
  if (items.length === 0) return
  const active = doc.activeElement as HTMLElement | null
  if (!active || !container.contains(active)) {
    e.preventDefault()
    items[0].focus()
    return
  }
  const index = items.indexOf(active)
  if (index === -1) {
    // Focus is on a non-tabbable element (heading, step body); only wrap when it sits before every item.
    const beforeFirst = Boolean(active.compareDocumentPosition(items[0]) & POSITION_FOLLOWING)
    if (!beforeFirst) return
  }
  const target = wrapFocusIndex(items.length, index, e.shiftKey)
  if (target === null) return
  e.preventDefault()
  items[target].focus()
}

/** True below `lg`; false during SSR and until the first effect runs. */
export function useSmallScreen(): boolean {
  const [small, setSmall] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(SMALL_SCREEN_QUERY)
    const update = () => setSmall(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return small
}

/** Locks page scroll while `active`, restoring the previous value afterwards. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [active])
}
