'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, CheckCircle2, Info, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { FooterState } from '@/lib/academy/view-labels'
import { cn } from '@/lib/utils'

const READY_NOTE = "You're all set."
const REASON_ID = 'complete-reason'
const ACTION_CLASS = 'h-11 rounded-xl px-4 text-[15px]'

interface CompleteFooterProps {
  state: FooterState
  backHref: string
  nextHref: string
  /** Completed date, for the line on a finished module. */
  completedOn: string | null
  isLastModule: boolean
  homeLabel: string
  /** Resolves true once the module is complete and the page is moving on. */
  onComplete: () => Promise<boolean>
}

function Note({ state, completedOn }: Pick<CompleteFooterProps, 'state' | 'completedOn'>) {
  const base = 'col-span-2 flex items-start gap-2 text-sm leading-5 sm:col-span-1 sm:justify-end'
  if (state.kind === 'blocked') {
    return (
      <p id={REASON_ID} aria-live="polite" className={cn(base, 'max-sm:order-first text-academy-navy')}>
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-academy-blue" />
        <span>{state.reason}</span>
      </p>
    )
  }
  const text = state.kind === 'ready' ? READY_NOTE : completedOn ? `You finished this on ${completedOn}.` : 'You finished this one.'
  return (
    <p aria-live="polite" className={cn(base, 'max-sm:order-first text-academy-success')}>
      {text}
    </p>
  )
}

function DoneCheck() {
  const reduceMotion = useReducedMotion()
  return (
    <motion.span
      role="status"
      className="flex h-11 items-center justify-center gap-2 rounded-xl bg-academy-success px-4 text-[15px] font-medium text-white"
      initial={reduceMotion ? false : { scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 22 }}
    >
      <CheckCircle2 aria-hidden className="size-5" />
      Module complete
    </motion.span>
  )
}

export function CompleteFooter({ state, backHref, nextHref, completedOn, isLastModule, homeLabel, onComplete }: CompleteFooterProps) {
  const [phase, setPhase] = useState<'idle' | 'saving' | 'done'>('idle')
  const blocked = state.kind === 'blocked'

  const handleComplete = async () => {
    if (blocked || phase !== 'idle') return
    setPhase('saving')
    setPhase((await onComplete()) ? 'done' : 'idle')
  }

  return (
    <footer className="sticky bottom-0 z-20 border-t border-academy-line bg-academy-paper pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
      <div className="mx-auto grid w-full max-w-[720px] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-5 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <Button asChild variant="outline" className={cn(ACTION_CLASS, 'bg-white')}>
          <Link href={backHref} prefetch={false}>
            <ArrowLeft aria-hidden />
            Back
          </Link>
        </Button>
        <Note state={state} completedOn={completedOn} />
        {state.kind === 'done' ? (
          <Button asChild className={ACTION_CLASS}>
            <Link href={nextHref} prefetch={false}>
              {isLastModule ? homeLabel : 'Next module'}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        ) : phase === 'done' ? (
          <DoneCheck />
        ) : (
          <Button
            type="button"
            onClick={handleComplete}
            aria-disabled={blocked || phase === 'saving'}
            aria-describedby={blocked ? REASON_ID : undefined}
            title={blocked ? state.reason : undefined}
            className={cn(
              ACTION_CLASS,
              blocked && 'cursor-not-allowed bg-academy-muted-fill text-academy-slate shadow-none hover:bg-academy-muted-fill hover:shadow-none active:scale-100',
            )}
          >
            {phase === 'saving' ? <Loader2 aria-hidden className="animate-spin" /> : null}
            Mark complete and continue
          </Button>
        )}
      </div>
    </footer>
  )
}
