'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Info, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { QuizPaper } from '@/lib/academy/quiz'
import { cn } from '@/lib/utils'
import { ProgressDots } from './ProgressDots'
import { HomeLink, QUIZ_ACTION_CLASS, QuizFooter } from './QuizFooter'
import { QuizHeader } from './QuizHeader'
import { QuizNotice } from './QuizNotice'

const CHOOSE_NOTE = 'Choose an answer to continue.'
const NOTE_ID = 'quiz-choose-note'

export interface SubmittedAnswer { questionId: string; chosen: string }

interface QuestionScreenProps {
  paper: QuizPaper
  notice: string | null
  /** Resolves once the server has answered, however it answered. */
  onSubmit: (answers: SubmittedAnswer[]) => Promise<void>
}

function AnswerCard({ name, option, checked, onChoose }: { name: string; option: string; checked: boolean; onChoose: () => void }) {
  return (
    <label
      className={cn(
        'flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border bg-white p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-academy-blue has-[:focus-visible]:ring-offset-2 sm:p-5',
        checked ? 'border-academy-blue bg-academy-blue-tint' : 'border-academy-line hover:border-academy-blue',
      )}
    >
      <input type="radio" name={name} value={option} checked={checked} onChange={onChoose} className="sr-only min-h-0 min-w-0" />
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
          checked ? 'border-academy-blue bg-academy-blue' : 'border-academy-slate bg-white',
        )}
      >
        {checked ? <span className="size-2 rounded-full bg-white" /> : null}
      </span>
      <span className={cn('min-w-0 text-base leading-6', checked && 'font-medium')}>{option}</span>
    </label>
  )
}

/** One attempt. Answers stay here until submitted, so a reload starts again. */
export function QuestionScreen({ paper, notice, onSubmit }: QuestionScreenProps) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Readonly<Record<string, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const legend = useRef<HTMLLegendElement>(null)
  const moved = useRef(false)

  const { questions } = paper
  const question = questions[index]
  const chosen = answers[question.id]
  const isLast = index === questions.length - 1
  const blocked = chosen === undefined

  // Keyboard and screen-reader users land on the new question. The first one is left to the page.
  useEffect(() => {
    if (moved.current) legend.current?.focus({ preventScroll: true })
  }, [index])

  const goTo = (next: number) => {
    moved.current = true
    setIndex(next)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (blocked || submitting) return
    if (!isLast) {
      goTo(index + 1)
      return
    }
    setSubmitting(true)
    await onSubmit(questions.map((q) => ({ questionId: q.id, chosen: answers[q.id] })))
    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
      <QuizHeader lead="FINAL STEP:" accent="Culture Quiz">
        <ProgressDots current={index} total={questions.length} isAnswered={(i) => answers[questions[i].id] !== undefined} />
      </QuizHeader>
      <div className="mx-auto w-full max-w-[720px] flex-1 space-y-6 px-5 py-8 sm:py-10">
        <QuizNotice message={notice} />
        <fieldset key={question.id}>
          <legend ref={legend} tabIndex={-1} className="text-balance text-xl font-semibold leading-snug outline-none sm:text-2xl">
            {question.text}
          </legend>
          <div className="mt-6 space-y-3">
            {question.options.map((option) => (
              <AnswerCard
                key={option}
                name={question.id}
                option={option}
                checked={chosen === option}
                onChoose={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
              />
            ))}
          </div>
        </fieldset>
      </div>
      <QuizFooter
        back={
          index === 0 ? (
            <HomeLink label="Back" />
          ) : (
            <Button type="button" variant="outline" className={cn(QUIZ_ACTION_CLASS, 'bg-white')} onClick={() => goTo(index - 1)}>
              <ArrowLeft aria-hidden />
              Back
            </Button>
          )
        }
        note={
          blocked ? (
            <p id={NOTE_ID} className="flex items-start gap-2 sm:justify-end">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-academy-blue" />
              <span>{CHOOSE_NOTE}</span>
            </p>
          ) : null
        }
        action={
          <Button
            type="submit"
            aria-disabled={blocked || submitting}
            aria-describedby={blocked ? NOTE_ID : undefined}
            className={cn(
              QUIZ_ACTION_CLASS,
              blocked && 'cursor-not-allowed bg-academy-muted-fill text-academy-slate shadow-none hover:bg-academy-muted-fill hover:shadow-none active:scale-100',
            )}
          >
            {submitting ? <Loader2 aria-hidden className="animate-spin" /> : null}
            {isLast ? 'Submit' : 'Next'}
            {!isLast ? <ArrowRight aria-hidden /> : null}
          </Button>
        }
      />
    </form>
  )
}
