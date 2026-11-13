'use client'

import { Loader2, Save, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export type Busy = 'save' | 'publish' | 'discard' | null

interface PublishPanelProps {
  busy: Busy
  dirty: boolean
  hasDraft: boolean
  problems: readonly string[]
  note: string
  onNote: (note: string) => void
  askReread: boolean
  onAskReread: (ask: boolean) => void
  confirmingReread: boolean
  confirmingDiscard: boolean
  onSave: () => void
  onPublish: () => void
  onDiscard: () => void
}

function Problems({ problems }: { problems: readonly string[] }) {
  if (problems.length === 0) return null
  return (
    <div className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <p className="font-medium">Before you can publish</p>
      <ul className="mt-1 list-disc space-y-1 pl-4">
        {problems.map((problem) => <li key={problem}>{problem}</li>)}
      </ul>
    </div>
  )
}

const publishLabel = (confirmingReread: boolean) => (confirmingReread ? 'Yes, publish and email everyone' : 'Publish')

export function PublishPanel(props: PublishPanelProps) {
  const { busy, dirty, hasDraft, problems, note, onNote, askReread, onAskReread, confirmingReread, confirmingDiscard } = props
  const working = busy !== null
  const nothingNew = !dirty && !hasDraft
  return (
    <section aria-labelledby="publish-heading" className="space-y-3">
      <h2 id="publish-heading" className="text-sm font-semibold">Save and publish</h2>
      <Button type="button" variant="outline" className="w-full" disabled={working || !dirty} onClick={props.onSave}>
        {busy === 'save' ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="mr-2 h-4 w-4" />}
        {dirty ? 'Save draft' : 'All changes saved'}
      </Button>
      <p className="text-xs text-muted-foreground">Hires don&apos;t see a draft. Nothing changes for them until you publish.</p>

      <Problems problems={problems} />

      <div className="space-y-1.5">
        <Label htmlFor="change-note">What changed?</Label>
        <Textarea id="change-note" value={note} onChange={(e) => onNote(e.target.value)} className="min-h-[72px] rounded-xl" maxLength={500} />
      </div>

      <div className="flex items-start gap-2">
        <Checkbox id="ask-reread" className="mt-0.5" checked={askReread} onCheckedChange={(checked) => onAskReread(checked === true)} />
        <Label htmlFor="ask-reread" className="leading-5">Ask everyone to re-read</Label>
      </div>
      {askReread ? <p className="text-xs text-muted-foreground">This reopens the module for all active staff and emails each of them.</p> : null}

      <Button type="button" className="w-full" disabled={working || nothingNew} onClick={props.onPublish}>
        {busy === 'publish' ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <Send aria-hidden="true" className="mr-2 h-4 w-4" />}
        {publishLabel(confirmingReread)}
      </Button>
      <p className="text-xs text-muted-foreground">People who already finished keep the version they completed.</p>

      {dirty || hasDraft ? (
        <Button type="button" variant="ghost" size="sm" className="w-full" disabled={working} onClick={props.onDiscard}>
          {confirmingDiscard ? 'Yes, discard my changes' : 'Discard draft'}
        </Button>
      ) : null}
    </section>
  )
}
