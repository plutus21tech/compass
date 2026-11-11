'use client'

import { useEffect, useRef } from 'react'

interface ScrollTarget {
  scrollIntoView: (options?: ScrollIntoViewOptions) => void
}

interface ElementLookup {
  getElementById: (id: string) => ScrollTarget | null
}

/** Scrolls `#id` into view when the URL hash names it. Returns whether it scrolled. */
export function scrollToHashOnce(hash: string, id: string, doc: ElementLookup): boolean {
  if (hash !== `#${id}`) return false
  const el = doc.getElementById(id)
  if (!el) return false
  el.scrollIntoView({ block: 'start' })
  return true
}

/**
 * The browser's own hash jump fires before a section that mounts after loading exists,
 * so once `ready` first turns true this scrolls to it (at most once per page visit).
 */
export function useScrollToHash(id: string, ready: boolean): void {
  const doneRef = useRef(false)
  useEffect(() => {
    if (!ready || doneRef.current) return
    doneRef.current = true
    scrollToHashOnce(window.location.hash, id, document)
  }, [id, ready])
}
