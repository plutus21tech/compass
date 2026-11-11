'use client'

import { useEffect, useState } from 'react'
import { parseSearchQuery } from '@/lib/search/query'
import type { SearchResults } from '@/lib/search/service'

const DEBOUNCE_MS = 200
export const SEARCH_ERROR = 'Search is unavailable right now. Pages still work.'

interface View {
  results: SearchResults | null
  loading: boolean
  error: string | null
}

/** The fetch state plus the query its results (or error) answer. */
export interface SearchState extends View {
  answered: string | null
}

const IDLE_VIEW: View = { results: null, loading: false, error: null }
const LOADING_VIEW: View = { results: null, loading: true, error: null }
const IDLE: SearchState = { ...IDLE_VIEW, answered: null }

/**
 * What the palette shows for `parsed`. Until a response answers exactly this query it reads as
 * loading -- never "No matches" and never the previous query's results, so Enter cannot open them.
 */
export function searchView(state: SearchState, parsed: string | null): View {
  if (!parsed) return IDLE_VIEW
  if (state.answered !== parsed) return LOADING_VIEW
  return { results: state.results, loading: state.loading, error: state.error }
}

export function useSearchResults(query: string): View {
  const [state, setState] = useState<SearchState>(IDLE)
  const parsed = parseSearchQuery(query)

  useEffect(() => {
    if (!parsed) {
      setState(IDLE)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(parsed)}`, { signal: controller.signal })
        const body = await res.json()
        if (!res.ok || !body?.success) throw new Error('search failed')
        setState({ results: body.data as SearchResults, loading: false, error: null, answered: parsed })
      } catch {
        if (controller.signal.aborted) return
        setState({ results: null, loading: false, error: SEARCH_ERROR, answered: parsed })
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [parsed])

  return searchView(state, parsed)
}
