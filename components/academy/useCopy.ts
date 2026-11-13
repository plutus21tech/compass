'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

const COPIED_MS = 1800

export function useCopy(): { copied: boolean; copy: (text: string) => void } {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), COPIED_MS)
      },
      () => toast.error("Your browser blocked copying. Select the text and copy it yourself."),
    )
  }, [])

  return { copied, copy }
}
