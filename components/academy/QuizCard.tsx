import Link from 'next/link'
import { ArrowRight, CheckCircle2, ClipboardCheck, Lock } from 'lucide-react'
import type { HomeQuizView } from '@/lib/academy/view'
import { quizCardCopy } from '@/lib/academy/view-labels'
import { cn } from '@/lib/utils'

const QUIZ_TITLE = 'Culture and Values Quiz'

function StatusLine({ quiz, label, linked }: { quiz: HomeQuizView; label: string; linked: boolean }) {
  if (quiz.status === 'DONE') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-academy-success/10 px-2.5 py-1 text-sm font-semibold text-academy-success">
        <CheckCircle2 aria-hidden className="size-4" />
        {label}
      </span>
    )
  }
  if (!linked) return <span className="text-sm text-academy-slate">{label}</span>
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-academy-blue-dark">
      {label}
      <ArrowRight aria-hidden className="size-4 shrink-0" />
    </span>
  )
}

/** The Final Step card: a module card's look, across the full width. */
export function QuizCard({ quiz, timeZone }: { quiz: HomeQuizView; timeZone: string | null }) {
  const { label, chip, href } = quizCardCopy(quiz, timeZone)
  const Icon = href ? ClipboardCheck : Lock
  const body = (
    <>
      <span
        aria-hidden
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          href ? 'bg-academy-blue-tint text-academy-blue-dark' : 'bg-academy-muted-fill text-academy-slate',
        )}
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-balance text-base font-semibold leading-snug text-academy-navy">{QUIZ_TITLE}</h3>
        <p className="mt-1">
          <StatusLine quiz={quiz} label={label} linked={href !== null} />
        </p>
      </div>
      {chip ? (
        <span className="shrink-0 rounded-full bg-academy-danger-tint px-2.5 py-1 text-xs font-semibold text-academy-danger">{chip}</span>
      ) : null}
    </>
  )
  const shared = 'flex items-start gap-4 rounded-2xl border p-5'

  if (!href) return <div className={cn(shared, 'border-academy-line bg-academy-muted-fill/60')}>{body}</div>
  return (
    <Link
      href={href}
      prefetch={false}
      className={cn(
        shared,
        'bg-white transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-academy-blue',
        quiz.status === 'DONE' ? 'border-academy-line' : 'border-academy-blue',
      )}
    >
      {body}
    </Link>
  )
}
