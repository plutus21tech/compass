'use client'

import { useEffect, useRef, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { screenFor, type QuizScreen } from '@/lib/academy/quiz-flow'
import type { QuizResultView, QuizView } from '@/lib/academy/view'
import { QUIZ_UNAVAILABLE_MESSAGE } from '@/lib/academy/view-labels'
import { cn } from '@/lib/utils'
import { AcademyRequestError, academyRequest, errorMessage } from '../api'
import { ACADEMY_THEME_VARS } from '../brand'
import { academySans, academySerif } from '../fonts'
import { AcademyPanel } from '../HomeStates'
import { QuestionScreen, type SubmittedAnswer } from './QuestionScreen'
import { HomeLink } from './QuizFooter'
import { ResultsScreen } from './ResultsScreen'
import { ValuesAcknowledgement } from './ValuesAcknowledgement'

const QUIZ_URL = '/api/onboarding/academy/quiz'
const HOME_HREF = '/onboarding'

interface QuizFlowProps {
  view: QuizView
  name: string
  timeZone: string | null
}

const readView = () => academyRequest<QuizView>(QUIZ_URL, 'GET')

/** The paper no longer stands: it changed, or the hire's state did. Trying again with it can't work. */
const isStalePaper = (error: unknown) =>
  error instanceof AcademyRequestError && (error.status === 409 || error.status === 400)

function Unavailable() {
  return (
    <AcademyPanel>
      <span aria-hidden className="mx-auto flex size-12 items-center justify-center rounded-full bg-academy-blue-tint text-academy-blue-dark">
        <CircleAlert className="size-6" />
      </span>
      <h1 tabIndex={-1} className="mt-5 text-balance text-xl font-semibold outline-none">{QUIZ_UNAVAILABLE_MESSAGE}</h1>
      <div className="mt-6">
        <HomeLink />
      </div>
    </AcademyPanel>
  )
}

export function QuizFlow({ view, name, timeZone }: QuizFlowProps) {
  const [screen, setScreen] = useState<QuizScreen>(() => screenFor(view))
  // Counts moves to a new screen: it starts a new attempt's state and takes focus to the top.
  const [moves, setMoves] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [retaking, setRetaking] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  const goTo = (next: QuizScreen) => {
    setScreen(next)
    setMoves((count) => count + 1)
  }

  // The app shell scrolls <main>, not the window.
  useEffect(() => {
    if (moves === 0) return
    root.current?.closest('main')?.scrollTo({ top: 0 })
    root.current?.querySelector('h1')?.focus({ preventScroll: true })
  }, [moves])

  useEffect(() => {
    if (screen.kind === 'home') window.location.assign(HOME_HREF)
  }, [screen.kind])

  /** Starts again from the server's state, keeping its message on whichever screen that turns out to be. */
  const restart = async (message: string) => {
    setNotice(message)
    try {
      goTo(screenFor(await readView(), { fresh: true }))
    } catch (error) {
      console.error('[academy] could not reload the quiz', error)
    }
  }

  /** The result is already on screen: this only learns how long the wait is, or that it is over. */
  const checkWait = async () => {
    setScreen((current) => (current.kind === 'results' ? { ...current, wait: { kind: 'checking' } } : current))
    try {
      setScreen(screenFor(await readView()))
    } catch (error) {
      // The retake button is the fallback: pressing it asks the server again.
      console.error('[academy] could not read the retake time', error)
      setScreen((current) => (current.kind === 'results' ? { ...current, wait: { kind: 'open' } } : current))
    }
  }

  // A second press lands before the screen's own state does, so the guard is a ref.
  const submitting = useRef(false)
  const submit = async (answers: SubmittedAnswer[]) => {
    if (submitting.current) return
    submitting.current = true
    setNotice(null)
    try {
      const result = await academyRequest<QuizResultView>(QUIZ_URL, 'POST', { answers })
      goTo({ kind: 'results', result, wait: { kind: 'checking' } })
      if (!result.passed) await checkWait()
    } catch (error) {
      if (isStalePaper(error)) await restart(errorMessage(error))
      else setNotice(errorMessage(error))
    } finally {
      submitting.current = false
    }
  }

  const retake = async () => {
    setNotice(null)
    setRetaking(true)
    try {
      goTo(screenFor(await readView(), { fresh: true }))
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setRetaking(false)
    }
  }

  return (
    <div
      ref={root}
      style={ACADEMY_THEME_VARS}
      className={cn(
        academySans.className,
        academySerif.variable,
        'flex min-h-[calc(100dvh-3.5rem)] flex-col bg-academy-paper text-academy-navy selection:bg-academy-blue/20',
      )}
    >
      {screen.kind === 'questions' ? <QuestionScreen key={moves} paper={screen.paper} notice={notice} onSubmit={submit} /> : null}
      {screen.kind === 'results' ? (
        <ResultsScreen
          result={screen.result}
          wait={screen.wait}
          notice={notice}
          timeZone={timeZone}
          retaking={retaking}
          onRetake={retake}
          onWaitOver={() => void checkWait()}
          onSign={() => goTo({ kind: 'acknowledgement' })}
        />
      ) : null}
      {screen.kind === 'acknowledgement' ? <ValuesAcknowledgement name={name} timeZone={timeZone} /> : null}
      {screen.kind === 'unavailable' ? <Unavailable /> : null}
    </div>
  )
}
