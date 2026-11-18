'use client'

import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MAX_HANDOVER_SUGGESTIONS, type HandoverSuggestion } from '@/lib/time-off/handover'
import type { DirectoryUser } from '@/lib/time-off/types'
import type { StepProps } from './DatesTypeStep'
import { HandoverItems } from './HandoverItems'

export type PanelModeKind = 'create' | 'edit'

interface HandoverStepProps extends StepProps {
  planRequired: boolean
  mode: PanelModeKind
  /** People who could cover an item (the viewer left out). */
  people?: DirectoryUser[]
}

const MY_WORK_URL = '/api/my-tasks?status=ACTIVE&sort=due_asc'
const NO_PEOPLE: DirectoryUser[] = []

/** Reads the open tasks out of the My work response; anything unexpected gives no suggestions. */
export function pickHandoverSuggestions(body: unknown): HandoverSuggestion[] {
  const tasks = body !== null && typeof body === 'object' ? (body as { tasks?: unknown }).tasks : null
  if (!Array.isArray(tasks)) return []
  const found: HandoverSuggestion[] = []
  for (const raw of tasks) {
    const task = raw as { id?: unknown; title?: unknown; status?: unknown; project?: { name?: unknown } | null }
    if (typeof task?.id !== 'string' || typeof task.title !== 'string' || task.status === 'DONE') continue
    const projectName = typeof task.project?.name === 'string' ? task.project.name : ''
    found.push({ id: task.id, title: task.title, projectName })
  }
  return found.slice(0, MAX_HANDOVER_SUGGESTIONS)
}

/** The viewer's open tasks, offered as tick-box handover items. A failed load just shows none. */
function useHandoverSuggestions(enabled: boolean): HandoverSuggestion[] {
  const [suggestions, setSuggestions] = useState<HandoverSuggestion[]>([])
  useEffect(() => {
    if (!enabled) return undefined
    let cancelled = false
    fetch(MY_WORK_URL, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => { if (!cancelled) setSuggestions(pickHandoverSuggestions(body)) })
      .catch((error: unknown) => console.error('[leave] handover suggestions failed', error))
    return () => { cancelled = true }
  }, [enabled])
  return suggestions
}

export const PLAN_REQUIRED_TEXT =
  'This leave needs a transition plan. You can add it now or later from My requests, before your leave starts.'
export const PLAN_OPTIONAL_TEXT = 'No transition plan is needed for this leave. You can still add one.'
export const PLAN_MANAGED_TEXT = 'The structured transition plan is managed from the request details.'

const SECTION = 'space-y-3 border-b border-border px-5 py-5 last:border-b-0'

function NotesField({ form, onChange, help }: StepProps & { help?: string }) {
  return (
    <div className={SECTION}>
      <div>
        <Label htmlFor="leave-notes" className="text-sm font-semibold text-foreground">
          General handover notes <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        {help && <p id="leave-notes-help" className="mt-1 text-xs text-muted-foreground">{help}</p>}
      </div>
      <Textarea
        id="leave-notes"
        aria-describedby={help ? 'leave-notes-help' : undefined}
        rows={4}
        value={form.transitionPlan}
        onChange={(e) => onChange({ ...form, transitionPlan: e.target.value })}
        placeholder="Any extra context for whoever covers your work."
      />
    </div>
  )
}

/** Step 2: the transition plan table and handover notes (notes only when editing). */
export function HandoverStep({ form, onChange, planRequired, mode, people = NO_PEOPLE }: HandoverStepProps) {
  const suggestions = useHandoverSuggestions(mode === 'create')
  if (mode === 'edit') return <NotesField form={form} onChange={onChange} help={PLAN_MANAGED_TEXT} />

  return (
    <div>
      <div className={SECTION}>
        <p
          role="status"
          className={`rounded-lg px-4 py-3 text-sm ${
            planRequired
              ? 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100'
              : 'bg-muted/60 text-muted-foreground'
          }`}
        >
          {planRequired ? PLAN_REQUIRED_TEXT : PLAN_OPTIONAL_TEXT}
        </p>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Transition plan</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            One line for each thing that needs covering while you are away. Filling it here submits it with your request.
          </p>
        </div>
        <HandoverItems
          tasks={form.tasks}
          onChange={(tasks) => onChange({ ...form, tasks })}
          people={people}
          suggestions={suggestions}
        />
      </div>
      <NotesField form={form} onChange={onChange} />
    </div>
  )
}
