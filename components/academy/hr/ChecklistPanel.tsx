'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ChecklistItemView } from '@/lib/academy/checklist'
import { formatAcademyDate } from '@/lib/academy/view-labels'
import { checklistChip, checklistNeedsReason } from '@/lib/academy/tracker-labels'
import { Chip } from './Chip'
import { ReasonForm } from './ReasonForm'
import { DATE_ZONE } from './tracker-api'

const OWNER_LABELS: Record<ChecklistItemView['ownerRole'], string> = {
  HR: 'HR',
  SECURITY: 'Security',
  OA: 'O&A',
  TEAM_LEAD: 'Team lead',
}

interface Props {
  items: readonly ChecklistItemView[]
  busyItemId: string | null
  onTick: (itemId: string, done: boolean, missReason?: string) => Promise<boolean>
}

interface RowProps {
  item: ChecklistItemView
  busy: boolean
  asking: boolean
  onAsk: (open: boolean) => void
  onTick: Props['onTick']
}

function ChecklistRow({ item, busy, asking, onAsk, onTick }: RowProps) {
  const done = item.doneAt !== null
  const locked = done && item.autoTicked
  const checkId = `check-${item.id}`
  const checkbox = useRef<HTMLInputElement>(null)

  const toggle = async (next: boolean) => {
    if (next && checklistNeedsReason(item)) return onAsk(true)
    await onTick(item.id, next)
  }
  const save = async (reason: string) => {
    if (await onTick(item.id, true, reason)) onAsk(false)
  }

  return (
    <li className="px-3 py-2 text-sm">
      <div className="flex items-start gap-3">
        <input
          ref={checkbox}
          id={checkId}
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
          checked={done}
          disabled={busy || locked || (done && item.state === 'DONE_LATE_NEEDS_REASON')}
          onChange={(e) => toggle(e.target.checked)}
        />
        <div className="min-w-0 flex-1">
          <label htmlFor={checkId} className="block font-medium">{item.title}</label>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{OWNER_LABELS[item.ownerRole]}</span>
            <span>Due {formatAcademyDate(item.dueAt, DATE_ZONE)}</span>
            <Chip chip={checklistChip(item.state)} />
            {locked && <span>Ticks itself</span>}
          </div>
          {item.missReason && <p className="mt-1 text-xs text-muted-foreground">Reason: {item.missReason}</p>}
          {item.state === 'DONE_LATE_NEEDS_REASON' && !asking && (
            <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => onAsk(true)}>Add reason</Button>
          )}
          {asking && (
            <ReasonForm
              id={`reason-${item.id}`}
              label="Reason for missing this date"
              saveLabel="Save"
              busy={busy}
              onCancel={() => onAsk(false)}
              onSave={(reason) => void save(reason)}
              fallbackFocus={() => checkbox.current}
            />
          )}
        </div>
      </div>
    </li>
  )
}

export function ChecklistPanel({ items, busyItemId, onTick }: Props) {
  const [askingId, setAskingId] = useState<string | null>(null)
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No checklist yet.</p>
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((item) => (
        <ChecklistRow
          key={item.id}
          item={item}
          busy={busyItemId === item.id}
          asking={askingId === item.id}
          onAsk={(open) => setAskingId(open ? item.id : null)}
          onTick={onTick}
        />
      ))}
    </ul>
  )
}
