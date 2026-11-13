import type { Block } from '@/lib/academy/blocks'
import { CopyButton } from './CopyButton'

interface CopyTextBlockProps {
  block: Extract<Block, { type: 'copyText' }>
}

export function CopyTextBlock({ block }: CopyTextBlockProps) {
  return (
    <section className="rounded-2xl border border-academy-line bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-academy-slate">{block.label}</h2>
        <CopyButton text={block.text} label={block.label} />
      </div>
      <p className="mt-2 leading-7 text-academy-navy [overflow-wrap:anywhere]">{block.text}</p>
    </section>
  )
}
