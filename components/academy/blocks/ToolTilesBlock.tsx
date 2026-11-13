import { ExternalLink } from 'lucide-react'
import type { Block } from '@/lib/academy/blocks'
import type { ModuleView } from '@/lib/academy/view'
import { BlockHeading } from './BlockHeading'

interface ToolTilesBlockProps {
  block: Extract<Block, { type: 'toolTiles' }>
  view: ModuleView
}

interface ToolRow { name: string; purpose: string; href: string | null }

function toolRows(block: ToolTilesBlockProps['block'], view: ModuleView): ToolRow[] {
  const listed = block.tools.map((tool) => ({
    name: tool.name,
    purpose: tool.purpose,
    href: tool.linkKey ? (view.links[tool.linkKey] ?? null) : null,
  }))
  const team = view.teamTools.map((tool) => ({ name: tool.name, purpose: tool.purpose, href: tool.url }))
  return block.includeTeamTools ? [...listed, ...team] : listed
}

export function ToolTilesBlock({ block, view }: ToolTilesBlockProps) {
  return (
    <section>
      <BlockHeading>{block.heading}</BlockHeading>
      <ul className="divide-y divide-academy-line rounded-2xl border border-academy-line bg-white">
        {toolRows(block, view).map((tool) => (
          <li key={tool.name} className="px-4 py-3">
            {tool.href ? (
              <a
                href={tool.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-semibold text-academy-blue underline underline-offset-2 hover:text-academy-blue-dark"
              >
                {tool.name}
                <ExternalLink aria-label="Opens in a new tab" className="size-3.5" />
              </a>
            ) : (
              <p className="font-semibold text-academy-navy">{tool.name}</p>
            )}
            <p className="mt-0.5 text-[15px] leading-6 text-academy-slate">{tool.purpose}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
