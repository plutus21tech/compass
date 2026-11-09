'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { formatAcademyDate } from '@/lib/academy/view-labels'
import { moduleChip } from '@/lib/academy/tracker-labels'
import type { DrawerModule } from '@/lib/academy/tracker'
import { Chip } from './Chip'
import { ReasonForm } from './ReasonForm'
import { DATE_ZONE } from './tracker-api'

interface Props {
  modules: readonly DrawerModule[]
  busyModuleId: string | null
  onUnlock: (moduleId: string) => void
  /** Resolves true when the server took it. */
  onMarkWatched: (moduleId: string, reason: string) => Promise<boolean>
}

interface RowProps {
  module: DrawerModule
  busy: boolean
  asking: boolean
  onAsk: (open: boolean) => void
  onUnlock: Props['onUnlock']
  onMarkWatched: Props['onMarkWatched']
}

function ModuleRow({ module: m, busy, asking, onAsk, onUnlock, onMarkWatched }: RowProps) {
  const row = useRef<HTMLLIElement>(null)
  const save = async (reason: string) => {
    if (await onMarkWatched(m.moduleId, reason)) onAsk(false)
  }
  return (
    <li ref={row} tabIndex={-1} className="px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-6 shrink-0 tabular-nums text-muted-foreground">{m.number}</span>
        <span className="min-w-0 flex-1 font-medium">{m.title}</span>
        <Chip chip={m.unlockedEarly && m.status !== 'COMPLETED' ? { label: 'Unlocked early', tone: 'neutral' } : moduleChip(m.status)} />
        {m.overdue && <Chip chip={{ label: 'Overdue', tone: 'danger' }} />}
        {m.completedAt ? (
          <span className="text-xs text-muted-foreground">Done {formatAcademyDate(m.completedAt, DATE_ZONE)}</span>
        ) : m.dueAt ? (
          <span className="text-xs text-muted-foreground">Due {formatAcademyDate(m.dueAt, DATE_ZONE)}</span>
        ) : null}
        {m.unlockable && (
          <Button type="button" size="sm" variant="outline" disabled={busy} aria-label={`Unlock early: ${m.title}`} onClick={() => onUnlock(m.moduleId)}>
            Unlock early
          </Button>
        )}
        {m.markWatchable && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            aria-label={`Mark watched: ${m.title}`}
            aria-expanded={asking}
            aria-controls={asking ? `watched-${m.moduleId}-form` : undefined}
            onClick={() => onAsk(!asking)}
          >
            Mark watched
          </Button>
        )}
      </div>
      {m.markedWatched && (
        <p className="mt-1 pl-9 text-xs text-muted-foreground">
          Marked watched{m.markedWatched.byName ? ` by ${m.markedWatched.byName}` : ''} on {formatAcademyDate(m.markedWatched.at, DATE_ZONE)}: {m.markedWatched.reason}
        </p>
      )}
      {asking && (
        <div id={`watched-${m.moduleId}-form`} className="pl-9">
          <ReasonForm
            id={`watched-${m.moduleId}`}
            label="Why the video couldn't be watched here"
            saveLabel="Mark watched"
            busy={busy}
            onCancel={() => onAsk(false)}
            onSave={(reason) => void save(reason)}
            fallbackFocus={() => row.current}
          />
        </div>
      )}
    </li>
  )
}

export function ModuleProgressPanel({ modules, busyModuleId, onUnlock, onMarkWatched }: Props) {
  const [askingId, setAskingId] = useState<string | null>(null)
  if (modules.length === 0) return <p className="text-sm text-muted-foreground">{"This hire's course hasn't been released yet."}</p>
  return (
    <ul className="divide-y rounded-lg border">
      {modules.map((m) => (
        <ModuleRow
          key={m.moduleId}
          module={m}
          busy={busyModuleId === m.moduleId}
          asking={askingId === m.moduleId}
          onAsk={(open) => setAskingId(open ? m.moduleId : null)}
          onUnlock={onUnlock}
          onMarkWatched={onMarkWatched}
        />
      ))}
    </ul>
  )
}
