import { cn } from '@/lib/utils'

export const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`)

/** A rate as a short bar and its percentage; low rates read amber so they stand out in a long table. */
export function RateBar({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>
  const tone = value >= 0.75 ? 'bg-emerald-500' : value >= 0.5 ? 'bg-primary' : 'bg-amber-500'
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
        <span className={cn('block h-full origin-left rounded-full transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]', tone)} style={{ transform: `scaleX(${Math.min(1, value)})` }} />
      </span>
      <span className="w-10 tabular-nums">{percent(value)}</span>
    </span>
  )
}
