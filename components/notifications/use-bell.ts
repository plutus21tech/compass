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

/**
 * Posts the unread items (at most 60) as read. Returns the updated list on success;
 * on any failure returns the same list untouched so it stays visible and unread
 * (the next open retries). Never throws.
 */
export async function markUnreadAsRead(
  items: BellItem[],
  fetchImpl: typeof fetch
): Promise<BellItem[]> {
  const refs = items
    .filter((item) => !item.read)
    .slice(0, MAX_REFS)
    .map((item) => ({ source: item.source, id: item.id }))
  if (refs.length === 0) return items
  try {
    const res = await fetchImpl('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refs }),
    })
    if (!res.ok) return items
    const done = new Set(refs.map((ref) => `${ref.source}:${ref.id}`))
    return items.map((item) => (done.has(`${item.source}:${item.id}`) ? { ...item, read: true } : item))
  } catch {
    return items
  }
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
    const items = await markUnreadAsRead(itemsRef.current, fetch)
    if (items === itemsRef.current) return
    itemsRef.current = items
    setState((prev) => ({ ...prev, items, unread: items.filter((item) => !item.read).length }))
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
