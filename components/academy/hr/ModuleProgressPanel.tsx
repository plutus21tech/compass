'use client'

import { Button } from '@/components/ui/button'
import { formatAcademyDate } from '@/lib/academy/view-labels'
import { moduleChip } from '@/lib/academy/tracker-labels'
import type { DrawerModule } from '@/lib/academy/tracker'
import { Chip } from './Chip'
import { DATE_ZONE } from './tracker-api'

interface Props {
  modules: readonly DrawerModule[]
  busyModuleId: string | null
  onUnlock: (moduleId: string) => void
}

export function ModuleProgressPanel({ modules, busyModuleId, onUnlock }: Props) {
  if (modules.length === 0) return <p className="text-sm text-muted-foreground">{"This hire's course hasn't been released yet."}</p>
  return (
    <ul className="divide-y rounded-lg border">
      {modules.map((m) => (
        <li key={m.moduleId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busyModuleId === m.moduleId}
              aria-label={`Unlock early: ${m.title}`}
              onClick={() => onUnlock(m.moduleId)}
            >
              Unlock early
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}
