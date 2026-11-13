import { Lock } from 'lucide-react'
import type { Block } from '@/lib/academy/blocks'
import { splitUnavailableAction } from '@/lib/academy/view-labels'
import { Button } from '@/components/ui/button'
import { Markdown } from './Markdown'

interface RichTextBlockProps {
  block: Extract<Block, { type: 'richText' }>
}

export function RichTextBlock({ block }: RichTextBlockProps) {
  const { markdown, action } = splitUnavailableAction(block.markdown)
  return (
    <section className="space-y-4">
      {markdown ? <Markdown>{markdown}</Markdown> : null}
      {action ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button
            type="button"
            disabled
            className="h-11 rounded-xl bg-academy-muted-fill px-5 text-academy-slate shadow-none disabled:opacity-100"
          >
            <Lock aria-hidden />
            {action.label}
          </Button>
          <span className="text-sm text-academy-slate">{action.note}</span>
        </div>
      ) : null}
    </section>
  )
}
