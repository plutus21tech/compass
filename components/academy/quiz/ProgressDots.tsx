import { cn } from '@/lib/utils'

interface ProgressDotsProps {
  /** Zero-based. */
  current: number
  total: number
  isAnswered: (index: number) => boolean
}

/** On the blue band. The words beside the dots say the same thing, so the dots are hidden from screen readers. */
export function ProgressDots({ current, total, isAnswered }: ProgressDotsProps) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
      <ol aria-hidden className="flex items-center gap-1.5">
        {Array.from({ length: total }, (_, index) => (
          <li
            key={index}
            className={cn(
              'size-2.5 rounded-full transition-colors',
              index === current ? 'bg-white outline outline-2 outline-offset-2 outline-white' : isAnswered(index) ? 'bg-white' : 'bg-white/35',
            )}
          />
        ))}
      </ol>
      <p className="text-[15px] font-medium tabular-nums">
        Question {current + 1} of {total}
      </p>
    </div>
  )
}
