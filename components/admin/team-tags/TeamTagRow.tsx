'use client'

import { ArrowDown, ArrowUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

export type AdminTeamTag = {
  code: string
  label: string
  shortLabel: string | null
  isInternal: boolean
  sortOrder: number
  archivedAt: string | null
  userCount: number
}

export type TeamTagPatch = Partial<{
  label: string
  shortLabel: string | null
  isInternal: boolean
  archived: boolean
}>

/**
 * One editable tag. Name and short name save when the field loses focus, so HR
 * can tab through a rename without a separate save button per row.
 */
export function TeamTagRow({
  tag,
  busy,
  isFirst,
  isLast,
  onPatch,
  onMove,
}: {
  tag: AdminTeamTag
  busy: boolean
  isFirst: boolean
  isLast: boolean
  onPatch: (code: string, patch: TeamTagPatch) => void
  onMove: (code: string, direction: -1 | 1) => void
}) {
  const archived = tag.archivedAt !== null

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center',
        archived && 'opacity-60'
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          aria-label={`Name for ${tag.code}`}
          defaultValue={tag.label}
          disabled={busy}
          className="sm:max-w-[200px]"
          onBlur={(e) => {
            const value = e.target.value.trim()
            if (value && value !== tag.label) onPatch(tag.code, { label: value })
            else e.target.value = tag.label
          }}
        />
        <Input
          aria-label={`Short name for ${tag.code}`}
          defaultValue={tag.shortLabel ?? ''}
          placeholder="Short"
          disabled={busy}
          className="sm:max-w-[90px]"
          onBlur={(e) => {
            const value = e.target.value.trim()
            if (value !== (tag.shortLabel ?? '')) onPatch(tag.code, { shortLabel: value || null })
          }}
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <code className="rounded bg-muted px-1.5 py-0.5">{tag.code}</code>
          <span>
            {tag.userCount} {tag.userCount === 1 ? 'person' : 'people'}
          </span>
          {archived && <Badge variant="secondary">Archived</Badge>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Switch
            checked={tag.isInternal}
            disabled={busy}
            onCheckedChange={(checked) => onPatch(tag.code, { isInternal: checked })}
          />
          Internal
        </label>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Move up"
          disabled={busy || isFirst}
          onClick={() => onMove(tag.code, -1)}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Move down"
          disabled={busy || isLast}
          onClick={() => onMove(tag.code, 1)}
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => onPatch(tag.code, { archived: !archived })}
        >
          {archived ? 'Unarchive' : 'Archive'}
        </Button>
      </div>
    </div>
  )
}
