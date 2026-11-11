'use client'

import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TransitionPlanTable } from '@/components/leave/TransitionPlanTable'
import type { StepProps } from './DatesTypeStep'

export type PanelModeKind = 'create' | 'edit'

interface HandoverStepProps extends StepProps {
  planRequired: boolean
  mode: PanelModeKind
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
export function HandoverStep({ form, onChange, planRequired, mode }: HandoverStepProps) {
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
            List each thing that needs covering while you are away. Filling it here submits it with your request.
          </p>
        </div>
        <TransitionPlanTable tasks={form.tasks} onChange={(tasks) => onChange({ ...form, tasks })} />
      </div>
      <NotesField form={form} onChange={onChange} />
    </div>
  )
}
