import type { Block } from '@/lib/academy/blocks'
import { Markdown } from './Markdown'

interface WarningBoxBlockProps {
  block: Extract<Block, { type: 'warningBox' }>
}

export function WarningBoxBlock({ block }: WarningBoxBlockProps) {
  return (
    <section className="rounded-r-2xl border-l-4 border-academy-danger bg-academy-danger-tint px-5 py-4 text-academy-navy">
      <h2 className="mb-2 text-lg font-semibold">{block.heading}</h2>
      <Markdown>{block.markdown}</Markdown>
    </section>
  )
}
