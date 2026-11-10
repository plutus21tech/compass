import type { Block } from '@/lib/academy/blocks'
import type { BlockContext } from '../types'
import { BlockHeading } from './BlockHeading'
import { LinkList, LinkRow } from './LinkRow'

interface TutorialCardsBlockProps {
  block: Extract<Block, { type: 'tutorialCards' }>
  context: BlockContext
}

export function TutorialCardsBlock({ block, context }: TutorialCardsBlockProps) {
  const { view, state, openLink, preview } = context
  if (view.tutorials.length === 0) return null
  const opened = view.tutorials.filter((tutorial) => state.linksOpenedAt[tutorial.key]).length
  return (
    <section>
      <BlockHeading aside={`${opened} of ${view.tutorials.length} opened`}>{block.heading}</BlockHeading>
      <LinkList>
        {view.tutorials.map((tutorial) => (
          <LinkRow
            key={tutorial.key}
            href={preview ? undefined : tutorial.url}
            opened={Boolean(state.linksOpenedAt[tutorial.key])}
            onOpen={() => openLink(tutorial.key)}
          >
            {tutorial.title}
          </LinkRow>
        ))}
      </LinkList>
    </section>
  )
}
