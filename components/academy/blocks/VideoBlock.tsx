import { PlayCircle } from 'lucide-react'
import type { Block } from '@/lib/academy/blocks'
import type { VideoBlockView } from '@/lib/academy/view'
import { academySerif } from '../fonts'
import type { BlockContext } from '../types'
import { VideoPlayer } from '../video/VideoPlayer'

interface VideoBlockProps {
  block: Extract<Block, { type: 'video' }> | VideoBlockView
  context: BlockContext
}

/** Until HR adds the video, this card is the whole page and the module is read to complete. */
function ComingSoonCard({ summary }: { summary: string }) {
  return (
    <section className="overflow-hidden rounded-2xl bg-academy-navy text-white">
      <div className="flex flex-col justify-center gap-4 px-6 py-10 sm:aspect-video sm:px-10">
        <PlayCircle aria-hidden className="size-10 text-white" strokeWidth={1.5} />
        <h2 className={`${academySerif.className} text-3xl italic sm:text-4xl`}>Video coming soon</h2>
        <p className="max-w-prose leading-7">{summary}</p>
      </div>
    </section>
  )
}

export function VideoBlock({ block, context }: VideoBlockProps) {
  if (!('ready' in block) || !block.ready) return <ComingSoonCard summary={block.summary} />
  return (
    <VideoPlayer
      video={block}
      title={context.view.title}
      moduleNumber={context.view.number}
      next={context.video.next}
      controller={context.video.controller}
    />
  )
}
