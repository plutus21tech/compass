'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useCopy } from '@/components/academy/useCopy'
import { PLACEHOLDER_KEYS } from '@/lib/academy/placeholders'

/** Beside the text fields: typed into any text, each one fills in with the hire's own details. */
export function PlaceholderList() {
  const { copied, copy } = useCopy()
  const [last, setLast] = useState<string | null>(null)
  return (
    <section aria-labelledby="placeholders-heading" className="space-y-2">
      <h2 id="placeholders-heading" className="text-sm font-semibold">Fill-ins</h2>
      <p className="text-xs text-muted-foreground">Copy one into any text. Each hire sees their own details in its place.</p>
      <ul className="grid gap-0.5">
        {PLACEHOLDER_KEYS.map((key) => {
          const name = `{${key}}`
          const done = copied && last === name
          const Icon = done ? Check : Copy
          return (
            <li key={key}>
              <button
                type="button"
                aria-label={`Copy ${name}`}
                onClick={() => {
                  setLast(name)
                  copy(name)
                }}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <code>{name}</code>
                <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
