import Link from 'next/link'
import { ArrowRight, CheckCircle2, Clock, Lock } from 'lucide-react'
import type { ModuleCardView } from '@/lib/academy/view'
import { moduleCardCopy } from '@/lib/academy/view-labels'
import { cn } from '@/lib/utils'
import { academyIcon } from './icons'

interface ModuleCardProps {
  card: ModuleCardView
  timeZone: string | null
}

function IconBadge({ card }: { card: ModuleCardView }) {
  const Icon = card.status === 'LOCKED' ? Lock : academyIcon(card.icon)
  const tone = card.status === 'LOCKED' ? 'bg-academy-muted-fill text-academy-slate' : 'bg-academy-blue-tint text-academy-blue-dark'
  return (
    <span aria-hidden className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', tone)}>
      <Icon className="size-5" />
    </span>
  )
}

function StatusLine({ card, label }: { card: ModuleCardView; label: string }) {
  if (card.status === 'COMPLETED') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-academy-success/10 px-2.5 py-1 text-sm font-semibold text-academy-success">
        <CheckCircle2 aria-hidden className="size-4" />
        {label}
      </span>
    )
  }
  if (card.status === 'LOCKED') return <span className="text-sm text-academy-slate">{label}</span>
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-academy-blue-dark">
      {label}
      <ArrowRight aria-hidden className="size-4" />
    </span>
  )
}

export function ModuleCard({ card, timeZone }: ModuleCardProps) {
  const { label, chip } = moduleCardCopy(card, timeZone)
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <IconBadge card={card} />
        {chip ? (
          <span className="rounded-full bg-academy-danger-tint px-2.5 py-1 text-xs font-semibold text-academy-danger">{chip}</span>
        ) : null}
      </div>
      <p className="mt-4 text-[13px] font-semibold tracking-[0.1em] text-academy-slate">
        MODULE {String(card.number).padStart(2, '0')}
      </p>
      <h3 className="mt-1 text-balance text-base font-semibold leading-snug text-academy-navy">{card.title}</h3>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-academy-slate">
        <Clock aria-hidden className="size-3.5" />
        About {card.estimatedMinutes} min
      </p>
      <div className="mt-auto pt-4">
        <StatusLine card={card} label={label} />
      </div>
      {card.status === 'IN_PROGRESS' ? (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-academy-blue-tint">
          <span className="block h-full w-2/5 bg-academy-blue" />
        </span>
      ) : null}
    </>
  )
  const shared = 'relative flex h-full min-h-[11.5rem] flex-col overflow-hidden rounded-2xl border p-5'

  if (card.status === 'LOCKED') {
    return <li className={cn(shared, 'border-academy-line bg-academy-muted-fill/60 text-academy-slate')}>{body}</li>
  }
  return (
    <li className="contents">
      {/* No prefetch: loading a module marks it as started. */}
      <Link
        href={`/onboarding/${card.slug}`}
        prefetch={false}
        className={cn(
          shared,
          'bg-white transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-academy-blue',
          card.status === 'COMPLETED' ? 'border-academy-line' : 'border-academy-blue',
        )}
      >
        {body}
      </Link>
    </li>
  )
}
