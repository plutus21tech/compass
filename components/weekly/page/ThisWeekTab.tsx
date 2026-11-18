'use client'

import { useState } from 'react'
import { Check, Clock, ClipboardList, Lock, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatTimestampDate } from '@/lib/format-date'
import { weekDueAt } from '@/lib/weekly/calendar'
import type { MySelfReview } from '@/lib/weekly/service/self-review'
import { inboxQueue, pendingQuestions } from '@/lib/weekly/timeline'
import type { InboxResponse, MySurveyResponse } from '@/lib/weekly/view-types'
import { FormsSection } from '../forms/FormsSection'
import { LateFormsSection } from '../forms/LateFormsSection'
import { MyMappingCard } from '../mapping/MyMappingCard'
import { SelfReviewCard } from '../self-review/SelfReviewCard'
import { SurveyForm } from '../survey/PulseSurveyCard'
import { QuestionFlowDialog } from './QuestionFlowDialog'
import { AnsweredThisRound, WhoYouEvaluate } from './RoundLists'
import { SectionTitle, TodoCard } from './TodoCard'
import type { EvaluationsData } from './use-evaluations'

const DONE_ICON = <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />

export interface WeeklyCardModel {
  state: 'no-round' | 'closed' | 'quiet' | 'catch-up' | 'todo' | 'ready' | 'done'
  title: string
  line: string
  status: string
  /** The button's words; null when there is nothing to open. */
  action: string | null
  progress: { done: number; total: number } | null
  /** The required task still needs the person, so its button is the primary one. */
  primary: boolean
}

function namesPhrase(names: string[]): string {
  const unique = [...new Set(names)]
  if (unique.length === 0) return ''
  if (unique.length <= 2) return unique.join(' and ')
  return `${unique[0]} and ${unique.length - 1} others`
}

const questions = (n: number): string => (n === 1 ? '1 question' : `${n} questions`)

/** What the Weekly questions card says, in every state the round can be in. */
export function weeklyCardModel(inbox: InboxResponse | null): WeeklyCardModel {
  const none = { progress: null, primary: false }
  if (!inbox?.cycle) {
    return { ...none, state: 'no-round', title: 'No round open', line: 'Weekly questions start once HR opens the round.', status: 'Nothing to do yet', action: null }
  }
  const { cycle } = inbox
  if (cycle.status === 'CLOSED') {
    return { ...none, state: 'closed', title: `The ${cycle.periodName} round is closed`, line: 'HR will share your report.', status: 'Your answers are in Answered this round', action: null }
  }
  const queue = inboxQueue(inbox.prompts, cycle.currentWeek)
  const scored = queue.filter((p) => p.kind === 'STANDARD')
  if (scored.length === 0) {
    const catchUp = cycle.currentWeek > cycle.questionWeeks
    return catchUp
      ? { ...none, state: 'catch-up', title: 'Catch-up week, no new questions', line: 'Nothing left to finish.', status: 'All clear', action: null }
      : { ...none, state: 'quiet', title: 'No questions this week', line: 'New ones arrive on Monday.', status: 'Nothing to do yet', action: null }
  }
  const pending = pendingQuestions(queue)
  const answered = scored.length - pending.length
  const progress = { done: answered, total: scored.length }
  const due = formatTimestampDate(weekDueAt(new Date(cycle.weekOneStartsOn), cycle.currentWeek))
  const about = namesPhrase(scored.map((p) => p.evaluatee.name))
  if (inbox.weekSubmittedAt) {
    return { state: 'done', title: 'You’re done for this week', line: `${questions(scored.length)} about ${about}, sent`, status: 'New questions arrive Monday', action: 'View answers', progress, primary: false }
  }
  const missed = pending.filter((p) => p.weekIndex < cycle.currentWeek).length
  const title = `${questions(scored.length)} about ${about}`
  if (pending.length === 0) {
    return { state: 'ready', title, line: `All answered. Send them by ${due}.`, status: 'Ready to send', action: 'Review and send', progress, primary: true }
  }
  return {
    state: 'todo',
    title,
    line: missed > 0 ? `Due ${due} · ${missed} from an earlier week` : `Due ${due}`,
    status: 'Saved as you go',
    action: answered > 0 ? 'Continue' : 'Start',
    progress,
    primary: true,
  }
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  return (
    <div>
      <div className="flex gap-1" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} aria-label="Questions answered this week">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < done ? 'bg-primary' : 'bg-muted'}`} />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{done} of {total} answered</p>
    </div>
  )
}

function WeeklyQuestionsCard({ data }: { data: EvaluationsData }) {
  const [open, setOpen] = useState(false)
  const model = weeklyCardModel(data.inbox)
  const due = model.state === 'todo'
  return (
    <>
      <TodoCard
        label="Weekly questions"
        tag="Required"
        icon={model.state === 'done' || model.state === 'catch-up' ? DONE_ICON : <ClipboardList className="h-5 w-5" aria-hidden />}
        title={model.title}
        line={<span className={due ? 'font-medium text-amber-700 dark:text-amber-300' : undefined}>{model.line}</span>}
        status={model.status}
        action={
          model.action ? (
            <Button variant={model.primary ? 'default' : 'outline'} onClick={() => setOpen(true)}>{model.action}</Button>
          ) : undefined
        }
      >
        {model.progress ? <ProgressBar {...model.progress} /> : null}
      </TodoCard>
      {data.inbox && (
        <QuestionFlowDialog open={open} onOpenChange={setOpen} inbox={data.inbox} version={data.version} onChanged={data.reload} />
      )}
    </>
  )
}

export interface SelfCardModel { title: string; line: string; sent: string | null; status: string; action: string | null; primary: boolean }

/** What the Self-evaluation card says: this month's is open, an earlier one was sent, or there are none yet. */
export function selfCardModel(review: MySelfReview | null): SelfCardModel {
  const latest = review ? [...review.history].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0] : undefined
  const sent = latest ? `${latest.monthName} sent on ${formatTimestampDate(latest.submittedAt)}` : null
  if (review?.current) {
    const parts = review.current.parts.length
    return {
      title: `${review.current.monthName}: ${review.current.title}`,
      line: `${parts} short ${parts === 1 ? 'part' : 'parts'}. Goes to your lead and HR, and is never scored.`,
      sent, status: 'Open now', action: 'Start', primary: false,
    }
  }
  if (latest) {
    return { title: 'Nothing due right now', line: 'One self-evaluation opens each month.', sent, status: 'Nothing to do yet', action: `View ${latest.monthName}`, primary: false }
  }
  return { title: 'No self-evaluations yet', line: 'Your first one opens during the round.', sent: null, status: 'Nothing to do yet', action: null, primary: false }
}

function SelfEvaluationCard({ data }: { data: EvaluationsData }) {
  const [open, setOpen] = useState(false)
  const model = selfCardModel(data.selfReview)
  const close = (next: boolean) => {
    setOpen(next)
    if (!next) void data.reload()
  }
  return (
    <>
      <TodoCard
        label="Self-evaluation"
        tag="Monthly"
        icon={model.action === 'Start' ? <PenLine className="h-5 w-5" aria-hidden /> : <Clock className="h-5 w-5" aria-hidden />}
        title={model.title}
        line={model.line}
        status={model.status}
        action={model.action ? <Button variant="outline" onClick={() => setOpen(true)}>{model.action}</Button> : undefined}
      >
        {model.sent ? (
          <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            {model.sent}
          </p>
        ) : null}
      </TodoCard>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Your self-evaluation</DialogTitle>
            <DialogDescription>Once sent it cannot be changed.</DialogDescription>
          </DialogHeader>
          <SelfReviewCard />
        </DialogContent>
      </Dialog>
    </>
  )
}

function PulseSurveyTodoCard({ survey, onSent }: { survey: MySurveyResponse | null; onSent: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [sentNow, setSentNow] = useState(false)
  const count = survey?.questions.length ?? 0
  const openSurvey = count > 0 && survey !== null
  const afterSend = async () => {
    setSentNow(true)
    setOpen(false)
    await onSent()
  }
  return (
    <>
      <TodoCard
        label="Pulse survey"
        tag="Optional"
        icon={sentNow ? DONE_ICON : <Lock className="h-5 w-5" aria-hidden />}
        title={sentNow ? 'Thanks, your answers went to HR' : openSurvey ? 'How is Plutus21 going for you?' : 'No survey open right now'}
        line={sentNow ? 'They don’t affect your evaluation.' : openSurvey ? `${count} quick ${count === 1 ? 'question' : 'questions'}` : 'HR opens one a few times each round.'}
        status={openSurvey && !sentNow ? 'About 30 seconds' : 'Nothing to do'}
        action={openSurvey && !sentNow ? <Button variant="outline" onClick={() => setOpen(true)}>Answer</Button> : undefined}
      >
        {openSurvey && !sentNow ? (
          <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-foreground">Only HR sees this. Never your lead or colleagues.</p>
        ) : null}
      </TodoCard>
      {survey && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[90vh] max-w-[560px] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>How is Plutus21 going for you?</DialogTitle>
              <DialogDescription>Optional · {count} {count === 1 ? 'question' : 'questions'}</DialogDescription>
            </DialogHeader>
            <SurveyForm data={survey} onSent={afterSend} />
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

function dueNote(inbox: InboxResponse | null): string | undefined {
  if (!inbox?.cycle || inbox.cycle.status !== 'RUNNING') return undefined
  return `Questions are due ${formatTimestampDate(weekDueAt(new Date(inbox.cycle.weekOneStartsOn), inbox.cycle.currentWeek))}`
}

/** This week: the three to-dos in one row, then what was answered and who the person evaluates. */
export function ThisWeekTab({ data }: { data: EvaluationsData }) {
  const progress = data.inbox?.progress ?? []
  return (
    <div className="space-y-8">
      {/* An earlier quarter HR reopened comes first: it is overdue. */}
      <LateFormsSection />
      {data.checkingLists && <MyMappingCard />}

      <section aria-labelledby="todos-heading">
        <SectionTitle id="todos-heading" title="Your to-dos" note={dueNote(data.inbox)} />
        {data.error ? (
          <p className="text-sm text-red-600 dark:text-red-400">{data.error}</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <WeeklyQuestionsCard data={data} />
            <SelfEvaluationCard data={data} />
            <PulseSurveyTodoCard survey={data.survey} onSent={data.reload} />
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <AnsweredThisRound groups={data.history?.groups ?? []} progress={progress} onChanged={data.reload} />
        <WhoYouEvaluate mapping={data.mapping} progress={progress} onChanged={data.reload} />
      </div>

      {/* The quarter-end forms some people fill in stay where they were, below the weekly work. */}
      <FormsSection />
    </div>
  )
}
