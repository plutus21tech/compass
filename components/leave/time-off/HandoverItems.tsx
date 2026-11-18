'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { MAX_TRANSITION_TASKS, type TransitionTask } from '@/lib/leave-transition-plan'
import {
  EMPTY_HANDOVER_TASK, isSuggestionAdded, toggleSuggestion, type HandoverSuggestion,
} from '@/lib/time-off/handover'
import type { DirectoryUser } from '@/lib/time-off/types'

interface HandoverItemsProps {
  tasks: TransitionTask[]
  onChange: (tasks: TransitionTask[]) => void
  /** People who could cover (the viewer is already left out). */
  people: DirectoryUser[]
  /** The viewer's open tasks from My work; the block is hidden when there are none. */
  suggestions: HandoverSuggestion[]
}

const NOBODY = ''
const SELECT =
  'h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function Suggestions({ tasks, onChange, suggestions }: Pick<HandoverItemsProps, 'tasks' | 'onChange' | 'suggestions'>) {
  if (suggestions.length === 0) return null
  const full = tasks.length >= MAX_TRANSITION_TASKS
  return (
    <fieldset className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
      <legend className="px-1 text-xs font-medium text-muted-foreground">From My work</legend>
      {suggestions.map((s) => {
        const added = isSuggestionAdded(tasks, s)
        const id = `handover-suggestion-${s.id}`
        return (
          <div key={s.id} className="flex items-start gap-2">
            <Checkbox
              id={id}
              checked={added}
              disabled={full && !added}
              onCheckedChange={() => onChange(toggleSuggestion(tasks, s))}
              className="mt-0.5"
            />
            <label htmlFor={id} className="min-w-0 text-sm text-foreground">
              {s.title}
              <span className="block text-xs text-muted-foreground">{s.projectName}</span>
            </label>
          </div>
        )
      })}
    </fieldset>
  )
}

/**
 * Step 2's handover list: one line per piece of work, who covers it and an optional link or note.
 * Whether it was accepted or completed belongs to the cover person, not this form.
 */
export function HandoverItems({ tasks, onChange, people, suggestions }: HandoverItemsProps) {
  const update = (i: number, patch: Partial<TransitionTask>) =>
    onChange(tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  const remove = (i: number) => onChange(tasks.filter((_, j) => j !== i))
  const add = () => onChange([...tasks, { ...EMPTY_HANDOVER_TASK }])
  const names = new Set(people.map((p) => p.name))

  return (
    <div className="space-y-3">
      <Suggestions tasks={tasks} onChange={onChange} suggestions={suggestions} />

      {tasks.map((task, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <Input
              aria-label={`Item ${i + 1}: what needs covering`}
              value={task.taskDetails}
              onChange={(e) => update(i, { taskDetails: e.target.value })}
              placeholder="What needs covering"
            />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove item ${i + 1}`} onClick={() => remove(i)}>
              <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Button>
          </div>
          {task.projectDept && <p className="text-xs text-muted-foreground">{task.projectDept}</p>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              aria-label={`Item ${i + 1}: who covers it`}
              className={SELECT}
              value={task.assignedTo}
              onChange={(e) => update(i, { assignedTo: e.target.value })}
            >
              <option value={NOBODY}>Who covers it (optional)</option>
              {/* A name typed before the picker existed stays selectable. */}
              {task.assignedTo && !names.has(task.assignedTo) && <option value={task.assignedTo}>{task.assignedTo}</option>}
              {people.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <Input
              aria-label={`Item ${i + 1}: link or notes`}
              value={task.links}
              onChange={(e) => update(i, { links: e.target.value })}
              placeholder="Link or notes (optional)"
            />
          </div>
        </div>
      ))}

      {tasks.length < MAX_TRANSITION_TASKS ? (
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-4 w-4" aria-hidden /> Add item
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Up to {MAX_TRANSITION_TASKS} items</p>
      )}
    </div>
  )
}
