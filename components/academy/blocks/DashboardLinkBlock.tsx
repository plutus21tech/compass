import { CheckCircle2, ExternalLink } from 'lucide-react'
import type { Block } from '@/lib/academy/blocks'
import { DASHBOARD_EVENT_KEY } from '@/lib/academy/view'
import { Button } from '@/components/ui/button'
import type { BlockContext } from '../types'

interface DashboardLinkBlockProps {
  block: Extract<Block, { type: 'dashboardLink' }>
  context: BlockContext
}

export function DashboardLinkBlock({ block, context }: DashboardLinkBlockProps) {
  const { view, state, openLink } = context
  const href = view.links.COMPANY_DASHBOARD
  if (!href) return null
  const open = () => openLink(DASHBOARD_EVENT_KEY)
  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Button asChild className="h-11 rounded-xl px-5 text-[15px]">
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={open} onAuxClick={open}>
          {block.label}
          <ExternalLink aria-hidden />
        </a>
      </Button>
      {state.linksOpenedAt[DASHBOARD_EVENT_KEY] ? (
        <span className="flex items-center gap-1.5 text-sm font-medium text-academy-success">
          <CheckCircle2 aria-hidden className="size-4" />
          Opened
        </span>
      ) : null}
    </section>
  )
}
