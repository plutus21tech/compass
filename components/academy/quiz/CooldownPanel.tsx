'use client'

import { useEffect, useState } from 'react'
import { Clock, Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RetakeWait } from '@/lib/academy/quiz-flow'
import { callTimeLabel, countdownLabel } from '@/lib/academy/view-labels'
import { HomeLink, QUIZ_ACTION_CLASS, QuizFooter } from './QuizFooter'

const TICK_MS = 1000
const RETAKE_OPEN_ANNOUNCEMENT = 'You can retake the quiz now.'

/** Null until mounted, so the server and the browser render the same thing. Re-read from the clock each tick. */
function useRemainingMs(at: string | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(null)
  useEffect(() => {
    if (!at) return
    const end = new Date(at).getTime()
    let timer: ReturnType<typeof setInterval> | undefined
    const tick = () => {
      const left = end - Date.now()
      setRemaining(left)
      if (left <= 0 && timer !== undefined) clearInterval(timer)
    }
    tick()
    timer = setInterval(tick, TICK_MS)
    return () => clearInterval(timer)
  }, [at])
  return at ? remaining : null
}

interface CooldownPanelProps {
  wait: RetakeWait
  timeZone: string | null
  retaking: boolean
  onRetake: () => void
}

function RetakeButton({ busy, onRetake }: { busy: boolean; onRetake: () => void }) {
  return (
    <Button type="button" onClick={onRetake} disabled={busy} className={QUIZ_ACTION_CLASS}>
      {busy ? <Loader2 aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />}
      Retake
    </Button>
  )
}

function Countdown({ remainingMs }: { remainingMs: number | null }) {
  return (
    <span role="timer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-academy-blue-tint px-4 text-lg font-semibold tabular-nums">
      <Clock aria-hidden className="size-5 text-academy-blue-dark" />
      {/* Holds the width until the first tick. */}
      <span className={remainingMs === null ? 'invisible' : undefined}>{countdownLabel(remainingMs ?? 0)}</span>
    </span>
  )
}

/** The footer for a failed attempt. The clock only decides what shows: the server still has the last word on a retake. */
export function CooldownPanel({ wait, timeZone, retaking, onRetake }: CooldownPanelProps) {
  const at = wait.kind === 'until' ? wait.at : null
  const remainingMs = useRemainingMs(at)
  const waiting = at !== null && (remainingMs === null || remainingMs > 0)
  const open = !waiting && wait.kind !== 'checking'

  return (
    <QuizFooter
      back={<HomeLink />}
      note={
        <>
          {at && waiting ? <p>{`You can retake the quiz after ${callTimeLabel(at, timeZone)}.`}</p> : null}
          <span role="status" className="sr-only">{at && open ? RETAKE_OPEN_ANNOUNCEMENT : ''}</span>
        </>
      }
      action={waiting ? <Countdown remainingMs={remainingMs} /> : <RetakeButton busy={!open || retaking} onRetake={onRetake} />}
    />
  )
}
