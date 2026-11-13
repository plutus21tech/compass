'use client'

import { useEffect, useRef } from 'react'

interface EndSentinelProps {
  /** False once the server has it, or on a finished module. */
  armed: boolean
  onSeen: () => void
}

/**
 * Sits at the end of the content. The observer's first callback runs straight after paint, so a
 * page that already fits the screen reports at once. It stays attached until the server has saved
 * the event, so a failed save is retried when the end of the page comes back into view.
 */
export function EndSentinel({ armed, onSeen }: EndSentinelProps) {
  const marker = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = marker.current
    if (!armed || !element) return undefined
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) onSeen()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [armed, onSeen])

  return <div ref={marker} aria-hidden className="h-px" />
}
