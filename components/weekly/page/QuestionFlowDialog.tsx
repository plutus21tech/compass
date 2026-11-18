'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatTimestampDate } from '@/lib/format-date'
import { awaitsNote } from '@/lib/weekly/answer-rules'
import { weekDueAt } from '@/lib/weekly/calendar'
import { inboxQueue, pendingQuestions } from '@/lib/weekly/timeline'
import type { InboxPrompt, InboxResponse } from '@/lib/weekly/view-types'
import { cn } from '@/lib/utils'
import { AnswerCard } from '../AnswerCard'
import { errorMessage, weeklyRequest } from '../weekly-api'

const REVIEW = 'review'

interface QuestionFlowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  inbox: InboxResponse
  /** Changes on every reload, so an answer card never keeps stale state. */
  version: number
  onChanged: () => Promise<void>
}

/** Where the flow opens: the first question still to answer (a choice waiting for its note first), else the review. */
export function flowStart(queue: readonly InboxPrompt[]): string {
  const pending = pendingQuestions(queue)
  return (pending.find(awaitsNote) ?? pending[0])?.id ?? REVIEW
}

/** Why Next is disabled, in words; null when the question can be left. */
export function nextBlocker(prompt: InboxPrompt): string | null {
  if (prompt.kind === 'COMMENT' || prompt.status === 'SUBMITTED') return null
  return awaitsNote(prompt) ? 'Add the note to continue' : 'Choose a statement to continue'
}

function answerText(prompt: InboxPrompt): string {
  if (prompt.kind === 'COMMENT') return prompt.answer?.commentText?.trim() || 'No comment (optional)'
  if (prompt.status !== 'SUBMITTED') return 'Not answered yet'
  return prompt.options.find((o) => o.id === prompt.answer?.optionId)?.text ?? 'Answered'
}

function Segments({ queue, at }: { queue: InboxPrompt[]; at: number }) {
  return (
    <div className="flex gap-1" aria-hidden>
      {queue.map((p, i) => (
        <span
          key={p.id}
          className={cn('h-1.5 flex-1 rounded-full', i === at ? 'bg-primary' : p.status === 'SUBMITTED' ? 'bg-primary/40' : 'bg-muted')}
        />
      ))}
    </div>
  )
}

/**
 * The weekly questions, one at a time, then a review step before the week is submitted.
 * Answers save as they are picked (the answer card does that), so closing the dialog loses nothing.
 */
export function QuestionFlowDialog({ open, onOpenChange, inbox, version, onChanged }: QuestionFlowDialogProps) {
  const week = inbox.cycle?.currentWeek ?? 0
  const queue = inboxQueue(inbox.prompts, week)
  const pending = pendingQuestions(queue)
  const [currentId, setCurrentId] = useState<string>(REVIEW)
  const [busy, setBusy] = useState(false)

  // Each opening starts at the first thing left to do.
  useEffect(() => {
    if (open) setCurrentId(flowStart(inboxQueue(inbox.prompts, week)))
    // only when the dialog opens, not on every reload
  }, [open])

  const at = queue.findIndex((p) => p.id === currentId)
  const current = at >= 0 ? queue[at] : null
  const due = inbox.cycle ? formatTimestampDate(weekDueAt(new Date(inbox.cycle.weekOneStartsOn), week)) : ''
  const submitted = Boolean(inbox.weekSubmittedAt)
  const blocker = current ? nextBlocker(current) : null

  async function submit() {
    setBusy(true)
    try {
      await weeklyRequest('/api/weekly/inbox', { method: 'POST', body: {} })
      toast.success('Answers sent. Thank you.')
      await onChanged()
      onOpenChange(false)
    } catch (e) {
      toast.error(errorMessage(e, 'Could not submit the week'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="space-y-3 border-b border-border px-5 pb-4 pt-5 text-left">
          <DialogTitle>{current ? `Questions about ${current.evaluatee.name}` : 'Check your answers'}</DialogTitle>
          <DialogDescription>
            {current ? `Question ${at + 1} of ${queue.length} · due ${due}` : 'You can change them until Sunday.'}
          </DialogDescription>
          <Segments queue={queue} at={at} />
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {current ? (
            <div className="space-y-3">
              <p className="text-xs font-medium text-primary">
                {current.topic}
                {current.weekIndex < week ? ` · from week ${current.weekIndex}` : ''}
              </p>
              <AnswerCard key={`${current.id}-${current.status}-${version}`} prompt={current} onChanged={onChanged} />
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {queue.length === 0 && <li className="p-4 text-sm text-muted-foreground">Nothing to answer this week.</li>}
              {queue.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{p.topic} · {p.evaluatee.name}</p>
                    <p className={cn('text-sm', p.kind === 'STANDARD' && p.status !== 'SUBMITTED' ? 'text-amber-700 dark:text-amber-300' : 'text-foreground')}>
                      {answerText(p)}
                    </p>
                  </div>
                  {p.canEdit && (
                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => setCurrentId(p.id)}>
                      {p.status === 'SUBMITTED' ? 'Change' : 'Answer'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/40 px-5 py-3">
          {current ? (
            <>
              <p className="text-sm text-muted-foreground">{blocker ?? 'Saved as you go'}</p>
              <div className="flex gap-2">
                {at > 0 && <Button variant="outline" onClick={() => setCurrentId(queue[at - 1].id)}>Back</Button>}
                <Button disabled={blocker !== null} onClick={() => setCurrentId(at < queue.length - 1 ? queue[at + 1].id : REVIEW)}>
                  {at < queue.length - 1 ? 'Next' : 'Review'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {submitted
                  ? 'Submitted. You can change answers until Sunday.'
                  : pending.length > 0
                    ? `${pending.length} ${pending.length === 1 ? 'question still needs' : 'questions still need'} an answer`
                    : 'Only you and HR see your answers'}
              </p>
              {submitted ? (
                <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              ) : (
                <Button disabled={busy || pending.length > 0 || queue.length === 0} onClick={() => void submit()}>
                  {busy ? 'Sending…' : 'Send answers'}
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
