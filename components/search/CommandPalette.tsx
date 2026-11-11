'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import type { SearchPage } from '@/components/layout/sidebar-config'
import { matchPages } from '@/lib/search/match-pages'
import { parseSearchQuery } from '@/lib/search/query'
import { formatDate } from '@/lib/format-date'
import { useSearchResults } from '@/components/search/use-search-results'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pages: readonly SearchPage[]
}

const ITEM_CLASS =
  'flex cursor-pointer flex-col gap-0.5 rounded-md px-3 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground'
const GROUP_CLASS =
  'px-1 py-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground'

function Sub({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-muted-foreground">{children}</span>
}

export function CommandPalette({ open, onOpenChange, pages }: CommandPaletteProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const { results, loading, error } = useSearchResults(open ? query : '')

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const pageMatches = useMemo(() => matchPages(pages, query), [pages, query])

  const go = (href: string) => {
    onOpenChange(false)
    router.push(href)
  }

  const people = results?.people ?? []
  const handbook = results?.handbook ?? []
  const projects = results?.projects ?? []
  const tasks = results?.tasks ?? []
  const yourWork = projects.length + tasks.length
  const total = pageMatches.length + people.length + handbook.length + yourWork
  const searching = parseSearchQuery(query) !== null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">Search Compass</DialogTitle>
        <Command shouldFilter={false} label="Search Compass">
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Search pages, people, handbook and your work"
            className="h-12 w-full border-b border-border bg-transparent px-4 pr-10 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-[60vh] overflow-y-auto p-1">
            {pageMatches.length > 0 && (
              <Command.Group heading="Pages" className={GROUP_CLASS}>
                {pageMatches.map((p) => (
                  <Command.Item key={p.href} value={`page:${p.href}`} onSelect={() => go(p.href)} className={ITEM_CLASS}>
                    <span>{p.label}</span>
                    {p.section && <Sub>{p.section}</Sub>}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {people.length > 0 && (
              <Command.Group heading="People" className={GROUP_CLASS}>
                {people.map((p) => (
                  <Command.Item key={p.id} value={`person:${p.id}`} onSelect={() => go(p.href)} className={ITEM_CLASS}>
                    <span>{p.name}</span>
                    <Sub>{[p.position, p.department].filter(Boolean).join(' · ')}</Sub>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {handbook.length > 0 && (
              <Command.Group heading="Handbook" className={GROUP_CLASS}>
                {handbook.map((h) => (
                  <Command.Item key={h.slug} value={`handbook:${h.slug}`} onSelect={() => go(h.href)} className={ITEM_CLASS}>
                    <span>{h.title}</span>
                    {h.description && <Sub>{h.description}</Sub>}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {yourWork > 0 && (
              <Command.Group heading="Your work" className={GROUP_CLASS}>
                {projects.map((p) => (
                  <Command.Item key={`p${p.id}`} value={`project:${p.id}`} onSelect={() => go(p.href)} className={ITEM_CLASS}>
                    <span>{p.name}</span>
                  </Command.Item>
                ))}
                {tasks.map((t) => (
                  <Command.Item key={`t${t.id}`} value={`task:${t.id}`} onSelect={() => go(t.href)} className={ITEM_CLASS}>
                    <span>{t.title}</span>
                    <Sub>
                      {t.projectName} · {formatDate(t.dueDate, { fallback: 'No due date' })}
                    </Sub>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {error && <p className="px-3 py-2 text-xs text-muted-foreground">{error}</p>}
            {searching && loading && total === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Searching…</p>}
            {searching && !loading && !error && total === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches for “{query}”.</p>
            )}
            {!searching && query.trim() !== '' && pageMatches.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches for “{query}”.</p>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
