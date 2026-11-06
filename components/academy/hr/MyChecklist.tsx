'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { ChecklistItemView } from '@/lib/academy/checklist'
import { ChecklistPanel } from './ChecklistPanel'
import { trackerErrorText, trackerFetch } from './tracker-api'

const BASE = '/api/admin/onboarding/checklist'

/** The checklist items the signed-in person owns on one hire. Shows nothing when they own none. */
export function MyChecklist({ newHireId }: { newHireId: string }) {
  const [items, setItems] = useState<readonly ChecklistItemView[]>([])
  const [busyItemId, setBusyItemId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const mine = await trackerFetch<ChecklistItemView[]>(`${BASE}/mine?newHireId=${encodeURIComponent(newHireId)}`)
    setItems(mine)
  }, [newHireId])

  useEffect(() => {
    load().catch((error: unknown) => toast.error(trackerErrorText(error)))
  }, [load])

  const onTick = async (itemId: string, done: boolean, missReason?: string): Promise<boolean> => {
    setBusyItemId(itemId)
    try {
      await trackerFetch(`${BASE}/${encodeURIComponent(itemId)}`, {
        method: 'PATCH',
        body: { done, ...(missReason ? { missReason } : {}) },
      })
      await load()
      toast.success(done ? 'Item ticked' : 'Item unticked')
      return true
    } catch (error) {
      toast.error(trackerErrorText(error))
      return false
    } finally {
      setBusyItemId(null)
    }
  }

  if (items.length === 0) return null
  return (
    <section className="space-y-3 border-t border-border pt-5 mt-5" aria-labelledby="my-checklist-heading">
      <h2 id="my-checklist-heading" className="text-lg font-semibold text-foreground">Your onboarding tasks</h2>
      <ChecklistPanel items={items} busyItemId={busyItemId} onTick={onTick} />
    </section>
  )
}
