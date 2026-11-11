'use client'

import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PlanReminderProps {
  count: number
  onAdd: () => void
}

/** Amber banner for own leave starting within 0-3 days that still has no transition plan. */
export function PlanReminder({ count, onAdd }: PlanReminderProps) {
  return (
    <div
      role="status"
      className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-50/60 p-4 sm:flex-row sm:items-start dark:bg-amber-500/10"
    >
      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-medium text-amber-900 dark:text-amber-300">Transition plan reminder</p>
        <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200">
          {count} upcoming leave request(s) are missing a transition plan. Please add it before your leave starts.
        </p>
      </div>
      <Button variant="outline" size="sm" className="self-start" onClick={onAdd}>
        Add plan
      </Button>
    </div>
  )
}
