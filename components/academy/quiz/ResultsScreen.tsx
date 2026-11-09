import { useId } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, PlayCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RetakeWait } from '@/lib/academy/quiz-flow'
import type { QuizResultView } from '@/lib/academy/view'
import { passMarkLabel } from '@/lib/academy/view-labels'
import { valueStripColour } from '../brand'
import { CooldownPanel } from './CooldownPanel'
import { HomeLink, QUIZ_ACTION_CLASS, QuizFooter } from './QuizFooter'
import { QuizHeader } from './QuizHeader'
import { QuizNotice } from './QuizNotice'
import { ScoreRing } from './ScoreRing'

interface ResultsScreenProps {
  result: QuizResultView
  wait: RetakeWait
  notice: string | null
  timeZone: string | null
  retaking: boolean
  onRetake: () => void
  onWaitOver: () => void
  onSign: () => void
}

function Verdict({ correct }: { correct: boolean }) {
  const Icon = correct ? CheckCircle2 : XCircle
  return (
    <p className="flex items-center gap-1.5 text-sm font-semibold">
      <Icon aria-hidden className={`size-5 ${correct ? 'text-academy-success' : 'text-academy-danger'}`} />
      {correct ? 'Correct' : 'Incorrect'}
    </p>
  )
}

function ReviewItem({ item }: { item: QuizResultView['review'][number] }) {
  const questionId = useId()
  return (
    <li className="flex overflow-hidden rounded-2xl border border-academy-line bg-white">
      <span aria-hidden className="w-2 shrink-0" style={{ backgroundColor: valueStripColour(item.valueKey) }} />
      <div className="min-w-0 flex-1 space-y-3 p-5">
        <Verdict correct={item.correct} />
        <h2 id={questionId} className="text-balance text-[17px] font-semibold leading-snug">{item.question}</h2>
        <dl className="space-y-2 text-[15px] leading-6">
          {item.correct ? null : (
            <div>
              <dt className="font-semibold">Your answer</dt>
              <dd>{item.chosen}</dd>
            </div>
          )}
          <div>
            <dt className="font-semibold">Correct answer</dt>
            <dd>{item.correctAnswer}</dd>
          </div>
        </dl>
        <p className="text-[15px] leading-6">{item.explanation}</p>
        {item.chapterHref ? (
          <Link
            href={item.chapterHref}
            aria-describedby={questionId}
            className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-academy-blue underline underline-offset-2 hover:text-academy-blue-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-academy-blue"
          >
            <PlayCircle aria-hidden className="size-4" />
            Watch this part
          </Link>
        ) : null}
      </div>
    </li>
  )
}

/** The review stays on screen behind a sticky action, so the next step never scrolls away. */
export function ResultsScreen({ result, wait, notice, timeZone, retaking, onRetake, onWaitOver, onSign }: ResultsScreenProps) {
  return (
    <>
      <QuizHeader lead={result.passed ? 'YOU' : 'NOT THERE'} accent={result.passed ? 'Passed' : 'Yet'}>
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
          <ScoreRing score={result.score} total={result.total} />
          <p className="text-[17px]">{passMarkLabel(result)}</p>
        </div>
      </QuizHeader>
      <div className="mx-auto w-full max-w-[720px] flex-1 space-y-4 px-5 py-8 sm:py-10">
        <QuizNotice message={notice} />
        <ol className="space-y-4">
          {result.review.map((item) => (
            <ReviewItem key={item.question} item={item} />
          ))}
        </ol>
      </div>
      {result.passed ? (
        <QuizFooter
          // On a phone the one next step takes the whole row: there is no room for both.
          back={<span className="max-sm:hidden"><HomeLink /></span>}
          action={
            <Button type="button" onClick={onSign} className={QUIZ_ACTION_CLASS}>
              Sign your acknowledgement
              <ArrowRight aria-hidden />
            </Button>
          }
        />
      ) : (
        <CooldownPanel wait={wait} timeZone={timeZone} retaking={retaking} onRetake={onRetake} onWaitOver={onWaitOver} />
      )}
    </>
  )
}
