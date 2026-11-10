import { cn } from '@/lib/utils'
import type { Chip as ChipData, ChipTone } from '@/lib/academy/tracker-labels'

const TONES: Record<ChipTone, string> = {
  neutral: 'bg-muted text-foreground',
  success: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  danger: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
}

export function Chip({ chip, className }: { chip: ChipData; className?: string }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', TONES[chip.tone], className)}>
      {chip.label}
    </span>
  )
}

export function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
      {message}
    </p>
  )
}
