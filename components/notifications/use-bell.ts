'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BellItem } from '@/lib/notifications/service'

const POLL_MS = 120_000
const MAX_REFS = 60
const LOAD_ERROR = 'Could not load notifications.'

interface BellState {
  items: BellItem[]
  unread: number
  loading: boolean
  error: string | null
}

export interface UseBell extends BellState {
  refresh: () => Promise<void>
  markShownRead: () => Promise<void>
}

export function useBell(enabled: boolean): UseBell {
  const [state, setState] = useState<BellState>({ items: [], unread: 0, loading: enabled, error: null })
  const itemsRef = useRef<BellItem[]>([])

  const refresh = useCallback(async () => {
    if (!enabled) return
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) throw new Error('bad response')
      const data = json.data as { items: BellItem[]; unread: number }
      itemsRef.current = data.items
      setState({ items: data.items, unread: data.unread, loading: false, error: null })
    } catch {
      setState((prev) => ({ ...prev, loading: false, error: LOAD_ERROR }))
    }
  }, [enabled])

  const markShownRead = useCallback(async () => {
    const refs = itemsRef.current
      .filter((item) => !item.read)
      .slice(0, MAX_REFS)
      .map((item) => ({ source: item.source, id: item.id }))
    if (refs.length === 0) return
    try {
      const res = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refs }),
      })
      if (!res.ok) throw new Error('mark read failed')
      const done = new Set(refs.map((ref) => `${ref.source}:${ref.id}`))
      const items = itemsRef.current.map((item) =>
        done.has(`${item.source}:${item.id}`) ? { ...item, read: true } : item
      )
      itemsRef.current = items
      setState((prev) => ({ ...prev, items, unread: items.filter((item) => !item.read).length }))
    } catch {
      setState((prev) => ({ ...prev, error: LOAD_ERROR }))
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, POLL_MS)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled, refresh])

  return { ...state, refresh, markShownRead }
}
