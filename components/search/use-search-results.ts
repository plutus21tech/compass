'use client'

import { useEffect, useState } from 'react'
import { parseSearchQuery } from '@/lib/search/query'
import type { SearchResults } from '@/lib/search/service'

const DEBOUNCE_MS = 200
export const SEARCH_ERROR = 'Search is unavailable right now. Pages still work.'

interface State {
  results: SearchResults | null
  loading: boolean
  error: string | null
}

const IDLE: State = { results: null, loading: false, error: null }

export function useSearchResults(query: string): State {
  const [state, setState] = useState<State>(IDLE)
  const parsed = parseSearchQuery(query)

  useEffect(() => {
    if (!parsed) {
      setState(IDLE)
      return
    }
    const controller = new AbortController()
    setState((prev) => ({ ...prev, loading: true, error: null }))
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(parsed)}`, { signal: controller.signal })
        const body = await res.json()
        if (!res.ok || !body?.success) throw new Error('search failed')
        setState({ results: body.data as SearchResults, loading: false, error: null })
      } catch (err) {
        if (controller.signal.aborted) return
        setState({ results: null, loading: false, error: SEARCH_ERROR })
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [parsed])

  return state
}
