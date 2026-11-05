import Link from 'next/link'
import type { OnboardingPhase } from '@prisma/client'
import { ArrowLeft, CheckCircle2, Circle, CircleDot, Lock } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import type { ModuleCardView } from '@/lib/academy/view'
import { moduleStatusLabel } from '@/lib/academy/view-labels'
import { cn } from '@/lib/utils'

const PHASES: ReadonlyArray<{ phase: OnboardingPhase; label: string }> = [
  { phase: 'DAY_1', label: 'Day 1' },
  { phase: 'WEEK_1', label: 'Week 1' },
]

export function StatusIcon({ card }: { card: ModuleCardView }) {
  const className = 'mt-0.5 size-5 shrink-0'
  switch (card.status) {
    case 'COMPLETED':
      return <CheckCircle2 aria-hidden className={cn(className, 'text-academy-blue')} />
    case 'LOCKED':
      return <Lock aria-hidden className={cn(className, 'p-0.5 text-academy-slate')} />
    case 'IN_PROGRESS':
      return <CircleDot aria-hidden className={cn(className, 'text-academy-blue')} />
    case 'AVAILABLE':
      return <Circle aria-hidden className={cn(className, 'text-academy-blue')} />
  }
}

export function RowText({ card, timeZone }: { card: ModuleCardView; timeZone: string | null }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-medium leading-5">
        {card.number}. {card.title}
      </span>
      <span className="mt-0.5 block text-[13px] leading-4 text-academy-slate">
        {moduleStatusLabel(card, timeZone)}
        {card.overdue ? <span className="ml-2 font-semibold text-academy-danger">Overdue</span> : null}
      </span>
    </span>
  )
}

interface RailItemProps {
  card: ModuleCardView
  current: boolean
  timeZone: string | null
}

function RailItem({ card, current, timeZone }: RailItemProps) {
  const body = (
    <>
      <StatusIcon card={card} />
      <RowText card={card} timeZone={timeZone} />
    </>
  )
  if (card.status === 'LOCKED') {
    return <li className="flex gap-2.5 rounded-xl px-3 py-2 text-academy-slate">{body}</li>
  }
  return (
    <li>
      {/* No prefetch: loading a module marks it as started. */}
      <Link
        href={`/onboarding/${card.slug}`}
        prefetch={false}
        aria-current={current ? 'page' : undefined}
        className={cn(
          'flex gap-2.5 rounded-xl px-3 py-2 text-academy-navy transition-colors hover:bg-academy-blue-tint focus-visible:outline focus-visible:outline-2 focus-visible:outline-academy-blue',
          current && 'bg-academy-blue-tint',
        )}
      >
        {body}
      </Link>
    </li>
  )
}

interface ModuleRailProps {
  rail: readonly ModuleCardView[]
  currentSlug: string
  timeZone: string | null
}

export function ModuleRail({ rail, currentSlug, timeZone }: ModuleRailProps) {
  const done = rail.filter((card) => card.status === 'COMPLETED').length
  return (
    <nav
      aria-label="Modules"
      className="sticky top-0 hidden max-h-[calc(100dvh-3.5rem)] self-start overflow-y-auto border-r border-academy-line px-3 py-5 lg:block"
    >
      <Link
        href="/onboarding"
        prefetch={false}
        className="mb-4 inline-flex items-center gap-1.5 rounded-md px-3 text-sm font-medium text-academy-blue underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-academy-blue"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Home
      </Link>
      <div className="mb-5 px-3">
        <p className="mb-2 text-sm font-semibold tabular-nums text-academy-navy">
          {done} of {rail.length} done
        </p>
        <Progress value={(done / rail.length) * 100} aria-label="Course progress" className="h-1.5" />
      </div>
      {PHASES.map(({ phase, label }) => (
        <div key={phase} className="mb-4">
          <p className="mb-1 px-3 text-sm font-semibold text-academy-slate">{label}</p>
          <ul aria-label={label} className="space-y-0.5">
            {rail
              .filter((card) => card.phase === phase)
              .map((card) => (
                <RailItem key={card.slug} card={card} current={card.slug === currentSlug} timeZone={timeZone} />
              ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}
