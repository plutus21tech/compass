'use client'

import { useCallback, useEffect, useState } from 'react'
import { buildTeamCatalog, EMPTY_TEAM_CATALOG, type TeamCatalog, type TeamTagDefinition } from './catalog'

/**
 * The team-tag catalog for client components, from GET /api/team-tags.
 *
 * Starts empty rather than with a hardcoded list, so a screen never offers a tag
 * that HR has archived or misses one HR just added. `reload` is for the screen
 * that edits tags.
 */
export function useTeamCatalog(): {
  catalog: TeamCatalog
  loading: boolean
  error: string | null
  reload: () => Promise<void>
} {
  const [catalog, setCatalog] = useState<TeamCatalog>(EMPTY_TEAM_CATALOG)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/team-tags', { cache: 'no-store' })
      const data = (await res.json().catch(() => ({}))) as {
        teams?: TeamTagDefinition[]
        error?: string
      }
      if (!res.ok || !Array.isArray(data.teams)) {
        throw new Error(data.error || 'Failed to load team tags')
      }
      setCatalog(buildTeamCatalog(data.teams))
      setError(null)
    } catch (err) {
      console.error('Failed to load team tags:', err)
      setError(err instanceof Error ? err.message : 'Failed to load team tags')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { catalog, loading, error, reload }
}
