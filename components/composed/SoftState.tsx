import type { ReactNode } from 'react'
import { Check, Minus, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type SoftStateTone = 'success' | 'neutral' | 'danger'

interface SoftStateProps {
  /** Green for "all clear", grey for "nothing yet", red only for "used up". */
  tone?: SoftStateTone
  icon?: LucideIcon
  title: string
  description?: ReactNode
  /** At most one button or link, and only when there is something useful to do. */
  action?: ReactNode
  className?: string
}

const TONE: Record<SoftStateTone, string> = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  neutral: 'bg-muted text-muted-foreground',
  danger: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
}

/**
 * The one pattern for "nothing here" and "used up" blocks: a small icon in a soft circle,
 * one bold line saying what is true, one muted line saying what happens next.
 * It centres itself in whatever height the block gives it, so layouts do not jump.
 */
export function SoftState({ tone = 'neutral', icon, title, description, action, className }: SoftStateProps) {
  const Icon = icon ?? (tone === 'success' ? Check : Minus)
  return (
    <div className={cn('flex flex-1 flex-col items-center justify-center gap-2 px-5 py-8 text-center', className)}>
      <span className={cn('flex h-10 w-10 items-center justify-center rounded-full', TONE[tone])}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="font-semibold text-foreground">{title}</p>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}
