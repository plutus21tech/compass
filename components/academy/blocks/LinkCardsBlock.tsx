import type { Block } from '@/lib/academy/blocks'
import type { ModuleView } from '@/lib/academy/view'
import { BlockHeading } from './BlockHeading'
import { LinkList, LinkRow } from './LinkRow'

interface LinkCardsBlockProps {
  block: Extract<Block, { type: 'linkCards' }>
  view: ModuleView
}

export function LinkCardsBlock({ block, view }: LinkCardsBlockProps) {
  // A link HR has not set yet has no href: its card hides.
  const links = block.links.flatMap((link) => {
    const href = view.links[link.linkKey]
    return href ? [{ label: link.label, href }] : []
  })
  if (links.length === 0) return null
  return (
    <section>
      <BlockHeading>{block.heading}</BlockHeading>
      <LinkList>
        {links.map((link) => (
          <LinkRow key={link.label} href={link.href}>
            {link.label}
          </LinkRow>
        ))}
      </LinkList>
    </section>
  )
}
