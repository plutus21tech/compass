import type { ReactNode } from 'react'
import { CheckCircle2, ExternalLink } from 'lucide-react'

interface LinkRowProps {
  href: string
  children: ReactNode
  opened?: boolean
  onOpen?: () => void
}

/**
 * Always a new tab, so the hire keeps their place in the course. `onAuxClick` catches a middle
 * click, which opens the link just the same.
 */
export function LinkRow({ href, children, opened = false, onOpen }: LinkRowProps) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onOpen}
        onAuxClick={onOpen}
        className="flex min-h-14 items-center gap-3 px-4 py-3 text-academy-navy transition-colors hover:bg-academy-blue-tint focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-academy-blue"
      >
        <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">{children}</span>
        {opened ? (
          <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-academy-success">
            <CheckCircle2 aria-hidden className="size-4" />
            Opened
          </span>
        ) : (
          <ExternalLink aria-label="Opens in a new tab" className="size-4 shrink-0 text-academy-blue" />
        )}
      </a>
    </li>
  )
}

export function LinkList({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-academy-line overflow-hidden rounded-2xl border border-academy-line bg-white">{children}</ul>
}
