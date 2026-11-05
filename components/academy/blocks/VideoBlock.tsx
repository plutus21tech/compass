import { PlayCircle } from 'lucide-react'
import type { Block } from '@/lib/academy/blocks'
import { academySerif } from '../fonts'

interface VideoBlockProps {
  block: Extract<Block, { type: 'video' }>
}

/** Until the videos are filmed, this card is the whole page and the module is read to complete. */
export function VideoBlock({ block }: VideoBlockProps) {
  return (
    <section className="overflow-hidden rounded-2xl bg-academy-navy text-white">
      <div className="flex flex-col justify-center gap-4 px-6 py-10 sm:aspect-video sm:px-10">
        <PlayCircle aria-hidden className="size-10 text-white" strokeWidth={1.5} />
        <h2 className={`${academySerif.className} text-3xl italic sm:text-4xl`}>Video coming soon</h2>
        <p className="max-w-prose leading-7">{block.summary}</p>
      </div>
    </section>
  )
}
