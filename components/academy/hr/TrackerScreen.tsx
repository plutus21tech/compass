'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TrackerFilters as Filters, TrackerRow } from '@/lib/academy/tracker'
import { ErrorLine } from './Chip'
import { TrackerDrawer } from './TrackerDrawer'
import { TrackerFilters } from './TrackerFilters'
import { TrackerTable } from './TrackerTable'
import { trackerErrorText, trackerFetch } from './tracker-api'

const sorted = (values: Iterable<string>) => [...values].sort((a, b) => a.localeCompare(b))

function queryOf(filters: Filters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
  const text = params.toString()
  return text ? `?${text}` : ''
}

export function TrackerScreen() {
  const [filters, setFilters] = useState<Filters>({})
  const [rows, setRows] = useState<TrackerRow[] | null>(null)
  const [options, setOptions] = useState<{ locations: string[]; departments: string[] }>({ locations: [], departments: [] })
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  // Answers can arrive out of order when filters change quickly: only the latest request may land.
  const latest = useRef(0)
  const load = useCallback(async () => {
    const mine = ++latest.current
    try {
      const next = await trackerFetch<TrackerRow[]>(`/api/admin/onboarding/tracker${queryOf(filters)}`)
      if (mine !== latest.current) return
      setRows(next)
      setError(null)
      // Options only ever grow, so narrowing a filter never hides the way back out.
      setOptions((prev) => ({
        locations: sorted(new Set([...prev.locations, ...next.flatMap((r) => (r.location ? [r.location] : []))])),
        departments: sorted(new Set([...prev.departments, ...next.flatMap((r) => (r.department ? [r.department] : []))])),
      }))
    } catch (e) {
      if (mine === latest.current) setError(trackerErrorText(e))
    }
  }, [filters])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => Boolean(filters.location || filters.department || filters.status), [filters])

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="text-2xl font-light tracking-tight sm:text-3xl">Onboarding tracker</h1>
        <p className="mt-1 text-muted-foreground">Everyone currently onboarding, and anyone who finished in the last 30 days.</p>
      </div>
      <TrackerFilters value={filters} locations={options.locations} departments={options.departments} onChange={setFilters} />
      <ErrorLine message={error} />
      {rows === null && !error && <p className="text-sm text-muted-foreground" role="status">Loading...</p>}
      {rows !== null && <TrackerTable rows={rows} filtered={filtered} onOpen={setOpenId} />}
      <TrackerDrawer newHireId={openId} onClose={() => setOpenId(null)} onChanged={() => void load()} />
    </div>
  )
}
