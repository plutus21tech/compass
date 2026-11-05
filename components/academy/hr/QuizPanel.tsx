'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatAcademyDateTime } from '@/lib/academy/view-labels'
import type { DrawerQuizAttempt } from '@/lib/academy/tracker'
import { Chip } from './Chip'
import { DATE_ZONE } from './tracker-api'

interface Props {
  attempts: readonly DrawerQuizAttempt[]
  busy: boolean
  onClear: () => void
}

export function QuizPanel({ attempts, busy, onClear }: Props) {
  const [confirming, setConfirming] = useState(false)
  if (attempts.length === 0) return <p className="text-sm text-muted-foreground">No quiz attempts yet.</p>
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {attempts.map((a) => (
          <li key={a.id} className="rounded-lg border px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium tabular-nums">{a.score} of {a.total}</span>
              <Chip chip={a.passed ? { label: 'Passed', tone: 'success' } : { label: 'Not passed', tone: 'warning' }} />
              <span className="text-xs text-muted-foreground">{formatAcademyDateTime(a.takenAt, DATE_ZONE)}</span>
            </div>
            {a.wrongQuestions.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  {a.wrongQuestions.length} wrong {a.wrongQuestions.length === 1 ? 'answer' : 'answers'}
                </summary>
                <ul className="mt-2 space-y-2">
                  {a.wrongQuestions.map((w) => (
                    <li key={w.questionId} className="text-xs">
                      <span className="block font-medium">{w.question}</span>
                      <span className="block text-muted-foreground">Chose: {w.chosen}</span>
                      <span className="block text-muted-foreground">Correct: {w.correctAnswer}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setConfirming(true)}>
        Clear attempts
      </Button>
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => { setConfirming(false); onClear() }}
        title="Clear quiz attempts?"
        message="This removes every attempt for this hire, so they can start the quiz again."
        confirmText="Clear attempts"
        variant="danger"
      />
    </div>
  )
}
