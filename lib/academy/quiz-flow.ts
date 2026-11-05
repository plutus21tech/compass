// Which quiz screen a hire sees. Pure, with no server-only imports: safe for client components.
import type { QuizPaper } from './quiz'
import type { QuizResultView, QuizView } from './view'

/** Where a failed hire stands: still finding out, waiting, or free to retake. */
export type RetakeWait = { kind: 'checking' } | { kind: 'until'; at: string } | { kind: 'open' }

export type QuizScreen =
  | { kind: 'questions'; paper: QuizPaper }
  | { kind: 'results'; result: QuizResultView; wait: RetakeWait }
  | { kind: 'acknowledgement' }
  | { kind: 'unavailable' }
  | { kind: 'home' }

const UNAVAILABLE: QuizScreen = { kind: 'unavailable' }

function readyScreen(view: QuizView, fresh: boolean): QuizScreen {
  const { lastResult, paper } = view
  if (!fresh && lastResult && !lastResult.passed) return { kind: 'results', result: lastResult, wait: { kind: 'open' } }
  return paper ? { kind: 'questions', paper } : UNAVAILABLE
}

/** `fresh` is a hire starting again, as opposed to landing on the page: they want the paper, not the old results. */
export function screenFor(view: QuizView, { fresh = false }: { fresh?: boolean } = {}): QuizScreen {
  switch (view.status) {
    case 'LOCKED':
      return { kind: 'home' }
    case 'READY':
      return readyScreen(view, fresh)
    case 'COOLDOWN':
      return view.lastResult && view.retakeAt
        ? { kind: 'results', result: view.lastResult, wait: { kind: 'until', at: view.retakeAt } }
        : UNAVAILABLE
    case 'PASSED_UNSIGNED':
    case 'DONE':
      // DONE reaches here only unfinished: a repeat signature retries the finish.
      return { kind: 'acknowledgement' }
    case 'UNAVAILABLE':
      return UNAVAILABLE
  }
}
