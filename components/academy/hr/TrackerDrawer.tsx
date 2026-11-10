'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { NO_CHECKLIST, hireStatusLabel, progressText } from '@/lib/academy/tracker-labels'
import type { TrackerDrawer as DrawerData } from '@/lib/academy/tracker'
import { AcknowledgementsPanel } from './AcknowledgementsPanel'
import { ChecklistPanel } from './ChecklistPanel'
import { ErrorLine } from './Chip'
import { LinkedinPanel } from './LinkedinPanel'
import { ModuleProgressPanel } from './ModuleProgressPanel'
import { PaymentPanel } from './PaymentPanel'
import { QuizPanel } from './QuizPanel'
import { trackerErrorText, trackerFetch } from './tracker-api'

const BASE = '/api/admin/onboarding'

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-baseline justify-between text-sm font-semibold">
        {title}
        {note && <span className="text-xs font-normal text-muted-foreground">{note}</span>}
      </h3>
      {children}
    </section>
  )
}

interface Props {
  newHireId: string | null
  onClose: () => void
  /** Called after any change, so the table behind the drawer stays true. */
  onChanged: () => void
}

type BusyKey = { kind: 'module' | 'item' | 'linkedin' | 'quiz'; id?: string } | null

export function TrackerDrawer({ newHireId, onClose, onChanged }: Props) {
  const [data, setData] = useState<DrawerData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<BusyKey>(null)

  // Each load gets a number; only the latest one may land, so a slow answer for a hire already
  // closed, or an older reload of this one, never overwrites a newer one.
  const latest = useRef(0)
  const wanted = useRef<string | null>(null)
  wanted.current = newHireId
  const load = useCallback(async (id: string) => {
    if (wanted.current !== id) return
    const request = ++latest.current
    const current = () => latest.current === request && wanted.current === id
    try {
      const next = await trackerFetch<DrawerData>(`${BASE}/tracker/${encodeURIComponent(id)}`)
      if (!current()) return
      setData(next)
      setError(null)
    } catch (e) {
      if (current()) setError(trackerErrorText(e))
    } finally {
      if (current()) setLoading(false)
    }
  }, [])

  useEffect(() => {
    setData(null)
    setError(null)
    if (!newHireId) return
    setLoading(true)
    void load(newHireId)
  }, [newHireId, load])

  // State updates land a render late, so a second click could start the same action twice.
  const running = useRef(false)

  /** Runs one action, then reloads the drawer and the table. Returns whether it worked. */
  const act = async (key: NonNullable<BusyKey>, run: () => Promise<unknown>, success: string): Promise<boolean> => {
    if (!newHireId || running.current) return false
    running.current = true
    setBusy(key)
    try {
      await run()
      toast.success(success)
      await load(newHireId)
      onChanged()
      return true
    } catch (e) {
      toast.error(trackerErrorText(e))
      return false
    } finally {
      running.current = false
      setBusy(null)
    }
  }

  const post = (path: string, body?: unknown) => trackerFetch(`${BASE}/tracker/${encodeURIComponent(newHireId ?? '')}/${path}`, { method: 'POST', body })

  const checklistDone = data?.checklist.filter((i) => i.doneAt !== null).length ?? 0

  return (
    <Sheet open={newHireId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{data?.name ?? 'Loading'}</SheetTitle>
          <SheetDescription>
            {data ? [data.title, data.department, data.location, hireStatusLabel(data.status)].filter(Boolean).join(' · ') : 'Onboarding details'}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          <ErrorLine message={error} />
          {loading && !data && <p className="text-sm text-muted-foreground" role="status">Loading...</p>}
          {data && (
            <>
              <Section title="Modules" note={progressText(data.modules.filter((m) => m.status === 'COMPLETED').length, data.modules.length)}>
                <ModuleProgressPanel
                  modules={data.modules}
                  busyModuleId={busy?.kind === 'module' ? (busy.id ?? null) : null}
                  onUnlock={(moduleId) => void act({ kind: 'module', id: moduleId }, () => post('unlock', { moduleId }), 'Module unlocked')}
                  onMarkWatched={(moduleId, reason) =>
                    act({ kind: 'module', id: moduleId }, () => post('mark-watched', { moduleId, reason }), 'Marked as watched')
                  }
                />
              </Section>
              <Section title="Acknowledgements">
                <AcknowledgementsPanel newHireId={data.newHireId} acknowledgements={data.acknowledgements} />
              </Section>
              <Section title="LinkedIn">
                <LinkedinPanel linkedin={data.linkedin} busy={busy?.kind === 'linkedin'} onVerify={() => void act({ kind: 'linkedin' }, () => post('verify-linkedin'), 'LinkedIn verified')} />
              </Section>
              <Section title="Quiz attempts">
                <QuizPanel attempts={data.quizAttempts} busy={busy?.kind === 'quiz'} onClear={() => void act({ kind: 'quiz' }, () => post('clear-quiz'), 'Attempts cleared')} />
              </Section>
              <Section title="HR checklist" note={progressText(checklistDone, data.checklist.length, NO_CHECKLIST)}>
                <ChecklistPanel
                  items={data.checklist}
                  busyItemId={busy?.kind === 'item' ? (busy.id ?? null) : null}
                  onTick={(itemId, done, missReason) =>
                    act(
                      { kind: 'item', id: itemId },
                      () => trackerFetch(`${BASE}/checklist/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: { done, ...(missReason ? { missReason } : {}) } }),
                      done ? 'Item ticked' : 'Item unticked',
                    )
                  }
                />
              </Section>
              <Section title="Payment details">
                {data.payment && data.userId ? (
                  <PaymentPanel key={data.userId} userId={data.userId} payment={data.payment} />
                ) : (
                  <p className="text-sm text-muted-foreground">No payment details saved yet.</p>
                )}
              </Section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
