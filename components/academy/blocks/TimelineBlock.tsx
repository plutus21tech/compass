import type { Block } from '@/lib/academy/blocks'
import { Markdown } from './Markdown'

interface TimelineBlockProps {
  block: Extract<Block, { type: 'timeline' }>
}

export function TimelineBlock({ block }: TimelineBlockProps) {
  return (
    <ol className="space-y-5 border-l-2 border-academy-line pl-5">
      {block.items.map((item) => (
        <li key={item.label} className="relative">
          <span aria-hidden className="absolute -left-[27px] top-1.5 size-3 rounded-full bg-academy-blue ring-4 ring-academy-paper" />
          <h2 className="font-semibold text-academy-navy">{item.label}</h2>
          <Markdown className="mt-1">{item.markdown}</Markdown>
        </li>
      ))}
    </ol>
  )
}
