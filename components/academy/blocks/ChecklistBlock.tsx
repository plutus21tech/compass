'use client'

import { ExternalLink } from 'lucide-react'
import type { Block } from '@/lib/academy/blocks'
import { INVOICE_TEMPLATE_KEY } from '@/lib/academy/completion'
import { Checkbox } from '@/components/ui/checkbox'
import type { BlockContext } from '../types'
import { BlockHeading } from './BlockHeading'

interface ChecklistBlockProps {
  block: Extract<Block, { type: 'checklist' }>
  context: BlockContext
}

function InvoiceTemplateLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="ml-12 mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-academy-blue underline underline-offset-2 hover:text-academy-blue-dark"
    >
      Open your invoice template
      <ExternalLink aria-hidden className="size-3.5" />
    </a>
  )
}

export function ChecklistBlock({ block, context }: ChecklistBlockProps) {
  const { state, readOnly, preview, setCheck, view } = context
  const done = block.items.filter((item) => state.checks[item.key] === true).length
  const showCount = block.items.length > 1
  return (
    <section>
      <BlockHeading aside={showCount ? `${done} of ${block.items.length} done` : undefined}>{block.heading}</BlockHeading>
      {!block.heading && showCount ? (
        <p className="mb-2 text-right text-sm tabular-nums text-academy-slate">{`${done} of ${block.items.length} done`}</p>
      ) : null}
      <ul className="divide-y divide-academy-line rounded-2xl border border-academy-line bg-white">
        {block.items.map((item) => {
          const id = `check-${item.key}`
          return (
            <li key={item.key}>
              <label htmlFor={id} className="flex min-h-14 cursor-pointer items-start gap-3 px-4 py-4 has-[:disabled]:cursor-default">
                <Checkbox
                  id={id}
                  className="mt-0.5 size-5 rounded-md border-academy-slate disabled:opacity-100"
                  checked={state.checks[item.key] === true}
                  disabled={readOnly || preview}
                  onCheckedChange={(checked) => setCheck(item.key, checked === true)}
                />
                <span className="min-w-0 leading-6 text-academy-navy">{item.label}</span>
              </label>
              {item.key === INVOICE_TEMPLATE_KEY && view.invoiceTemplateHref ? (
                <InvoiceTemplateLink href={view.invoiceTemplateHref} />
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
