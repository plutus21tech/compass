'use client'

import { useMemo, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'

export interface SelectableMember {
  id: string
  name: string
  department?: string | null
}

interface Props {
  /** The pool to choose from (already filtered, e.g. excludes the current user). */
  members: SelectableMember[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
  /** Shown when the pool itself is empty (no one to pick). */
  emptyPoolText?: string
  /** At most this many people; at the limit the search is disabled. Unlimited when omitted. */
  max?: number
  /** Accessible name for the search input. */
  inputLabel?: string
  /** Id for the search input, so a visible label can point at it. */
  inputId?: string
  /** Show the list only once something is typed, instead of the whole pool up front. */
  searchToOpen?: boolean
  /** People offered as one-click chips before anything is typed (e.g. the viewer's teammates). */
  suggestedIds?: string[]
}

const MAX_SUGGESTED = 2

/**
 * An email "To"-field style multi-select: chosen people appear as removable chips inline with
 * the search input, and the suggestion list below shows only people not yet selected. This keeps
 * the current selection visible at a glance instead of buried as checkmarks in a scroll list.
 */
export function MemberMultiSelect({
  members,
  selectedIds,
  onChange,
  placeholder = 'Search by name or department...',
  emptyPoolText = 'No team members available',
  max,
  inputLabel,
  inputId,
  searchToOpen = false,
  suggestedIds,
}: Props) {
  const [query, setQuery] = useState('')
  const atLimit = max !== undefined && selectedIds.length >= max
  const typed = query.trim()
  const listOpen = !searchToOpen || typed !== ''

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])

  // Preserve the order in which people were added.
  const selectedMembers = useMemo(
    () => selectedIds.map((id) => memberById.get(id)).filter((m): m is SelectableMember => Boolean(m)),
    [selectedIds, memberById]
  )

  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const selected = new Set(selectedIds)
    return members.filter((m) => {
      if (selected.has(m.id)) return false
      if (!normalized) return true
      return (
        m.name.toLowerCase().includes(normalized) ||
        (m.department ?? '').toLowerCase().includes(normalized)
      )
    })
  }, [members, selectedIds, query])

  const suggested = useMemo(() => {
    const selected = new Set(selectedIds)
    return (suggestedIds ?? [])
      .filter((id) => !selected.has(id))
      .map((id) => memberById.get(id))
      .filter((m): m is SelectableMember => Boolean(m))
      .slice(0, MAX_SUGGESTED)
  }, [suggestedIds, selectedIds, memberById])

  const add = (id: string) => {
    if (atLimit || selectedIds.includes(id)) return
    onChange([...selectedIds, id])
    setQuery('')
  }

  const remove = (id: string) => onChange(selectedIds.filter((x) => x !== id))

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && query === '' && selectedMembers.length > 0) {
      remove(selectedMembers[selectedMembers.length - 1].id)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
        <Search className="w-4 h-4 shrink-0 text-muted-foreground" />
        {selectedMembers.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary"
          >
            {m.name}
            <button
              type="button"
              onClick={() => remove(m.id)}
              className="rounded-full p-0.5 hover:bg-primary/20"
              aria-label={`Remove ${m.name}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          aria-label={inputLabel}
          value={atLimit ? '' : query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={atLimit}
          placeholder={atLimit ? `Up to ${max} people` : selectedMembers.length > 0 ? 'Add another...' : placeholder}
          className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
      </div>

      {!listOpen && !atLimit && suggested.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Suggested:</span>
          {suggested.map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => add(m.id)}
              aria-label={`Add ${m.name}`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              <Plus className="h-3 w-3" aria-hidden />
              {m.name}
            </button>
          ))}
        </div>
      )}

      <div
        hidden={!listOpen}
        className="mt-2 max-h-32 overflow-y-auto rounded-md border border-input bg-muted p-2 space-y-1.5"
      >
        {members.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">{emptyPoolText}</p>
        ) : suggestions.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">
            {!typed
              ? 'Everyone is already selected'
              : searchToOpen
                ? `No one matches "${typed}". Check the spelling or search by team.`
                : 'No matches found'}
          </p>
        ) : (
          suggestions.map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => add(m.id)}
              disabled={atLimit}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="text-sm text-foreground">{m.name}</span>
              {m.department && <span className="text-xs text-muted-foreground">({m.department})</span>}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
