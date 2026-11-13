import type { Block } from '@/lib/academy/blocks'
import type { ModuleView, PersonView } from '@/lib/academy/view'
import { initialsOf, peopleForBlock } from '@/lib/academy/view-labels'
import { BlockHeading } from './BlockHeading'
import { CopyButton } from './CopyButton'

interface PeopleCardsBlockProps {
  block: Extract<Block, { type: 'peopleCards' }>
  view: ModuleView
}

function PersonCard({ person, isBuddy }: { person: PersonView; isBuddy: boolean }) {
  return (
    <li className="relative flex min-w-0 gap-3 overflow-hidden rounded-2xl border border-academy-line bg-white p-4">
      <span
        aria-hidden
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-academy-blue-tint text-base font-semibold text-academy-blue-dark"
      >
        {initialsOf(person.name)}
      </span>
      <div className="min-w-0 flex-1">
        {isBuddy ? (
          <p className="mb-1 inline-block rounded-full bg-academy-blue px-2.5 py-0.5 text-xs font-semibold text-white">Your buddy</p>
        ) : null}
        <p className="font-semibold text-academy-navy [overflow-wrap:anywhere]">{person.name}</p>
        {person.title ? <p className="text-sm text-academy-slate">{person.title}</p> : null}
        {person.email ? (
          <a
            href={`mailto:${person.email}`}
            className="mt-1 block text-sm text-academy-blue underline underline-offset-2 hover:text-academy-blue-dark [overflow-wrap:anywhere]"
          >
            {person.email}
          </a>
        ) : null}
        {person.discordUsername ? (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0 text-sm text-academy-navy [overflow-wrap:anywhere]">{person.discordUsername}</span>
            <CopyButton text={person.discordUsername} label={`${person.name}'s Discord username`} />
          </div>
        ) : null}
      </div>
    </li>
  )
}

export function PeopleCardsBlock({ block, view }: PeopleCardsBlockProps) {
  const people = peopleForBlock(block.source, block.group, view)
  if (people.length === 0) return null
  return (
    <section>
      <BlockHeading>{block.heading}</BlockHeading>
      <ul className="grid gap-3 sm:grid-cols-2">
        {people.map((person) => (
          <PersonCard key={person.id} person={person} isBuddy={block.source === 'buddy'} />
        ))}
      </ul>
    </section>
  )
}
