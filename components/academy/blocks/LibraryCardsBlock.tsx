import { ExternalLink } from 'lucide-react'
import type { Block } from '@/lib/academy/blocks'
import type { CommuteView, LibraryCardView, ModuleView } from '@/lib/academy/view'
import { commuteTable } from '@/lib/academy/view-labels'
import { academyIcon } from '../icons'
import { DataTableBlock } from './DataTableBlock'
import { Markdown } from './Markdown'

interface LibraryCardsBlockProps {
  block: Extract<Block, { type: 'libraryCards' }>
  view: ModuleView
}

function CommuteRates({ commute }: { commute: CommuteView }) {
  if (commute.rows.length === 0) return <p className="leading-7">{commute.emptyMessage}</p>
  const { headers, rows } = commuteTable(commute.rows)
  return <DataTableBlock headers={headers} rows={rows} />
}

function LibraryCard({ card, commute }: { card: LibraryCardView; commute: CommuteView }) {
  const Icon = academyIcon(card.icon)
  return (
    <li className="flex gap-4 rounded-2xl border border-academy-line bg-white p-4 sm:p-5">
      <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-academy-blue-tint">
        <Icon className="size-6 text-academy-blue" />
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <h2 className="text-lg font-semibold text-academy-navy">{card.title}</h2>
        {card.parts.map((part, index) =>
          part.kind === 'text' ? (
            <Markdown key={index}>{part.text}</Markdown>
          ) : (
            <CommuteRates key={index} commute={commute} />
          ),
        )}
        {card.links.length > 0 ? (
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {card.links.map((link) => (
              <li key={link.label}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-medium text-academy-blue underline underline-offset-2 hover:text-academy-blue-dark"
                >
                  {link.label}
                  <ExternalLink aria-label="Opens in a new tab" className="size-3.5" />
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  )
}

export function LibraryCardsBlock({ block, view }: LibraryCardsBlockProps) {
  const cards = view.library[block.kind]
  if (cards.length === 0) return <p className="leading-7">Nothing to show here yet. Ask HR if you expected something.</p>
  return (
    <ul className="space-y-3">
      {cards.map((card) => (
        <LibraryCard key={card.id} card={card} commute={view.commute} />
      ))}
    </ul>
  )
}
