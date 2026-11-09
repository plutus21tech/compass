// Which quiz screen a hire sees. Pure, with no server-only imports: safe for client components.
import type { QuizPaper } from './quiz'
import type { QuizResultView, QuizView } from './view'

/** Where a failed hire stands: still finding out, waiting, or free to retake. */
/** `at` is the server's retake time, for display; `opensAtMs` is the same moment on this browser's clock. */
export type RetakeWait = { kind: 'checking' } | { kind: 'until'; at: string; opensAtMs: number } | { kind: 'open' }

/** The server's retake time moved onto this browser's clock, using how far apart the two clocks were on receipt. */
export function localRetakeMs(at: string, serverNow: string, receivedAtMs: number): number {
  return new Date(at).getTime() - (new Date(serverNow).getTime() - receivedAtMs)
}

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

/**
 * `fresh` is a hire starting again, as opposed to landing on the page: they want the paper, not the old
 * results. `receivedAtMs` is when the view arrived, on this browser's clock.
 */
export function screenFor(
  view: QuizView, { fresh = false, receivedAtMs = Date.now() }: { fresh?: boolean; receivedAtMs?: number } = {},
): QuizScreen {
  switch (view.status) {
    case 'LOCKED':
      return { kind: 'home' }
    case 'READY':
      return readyScreen(view, fresh)
    case 'COOLDOWN':
      return view.lastResult && view.retakeAt
        ? {
            kind: 'results',
            result: view.lastResult,
            wait: { kind: 'until', at: view.retakeAt, opensAtMs: localRetakeMs(view.retakeAt, view.serverNow, receivedAtMs) },
          }
        : UNAVAILABLE
    case 'PASSED_UNSIGNED':
    case 'DONE':
      // DONE reaches here only unfinished: a repeat signature retries the finish.
      return { kind: 'acknowledgement' }
    case 'UNAVAILABLE':
      return UNAVAILABLE
  }
}
