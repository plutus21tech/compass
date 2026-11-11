'use client'

import { daysLeftSuffix, formatDays } from '@/lib/format-count'
import type { BalanceCardModel, NextLeaveModel } from '@/lib/time-off/balance-cards'
import { LEAVE_TYPE_STYLE } from './leave-style'

interface BalanceCardsProps {
  cards: BalanceCardModel[]
  next: NextLeaveModel | null
  onOpenRequest: (id: string) => void
}

const CELL = 'bg-card p-5'

function formatLeft(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10)
}

function BalanceCard({ card }: { card: BalanceCardModel }) {
  const style = LEAVE_TYPE_STYLE[card.type]
  const unit = card.isEmpty ? 'left' : `${daysLeftSuffix(card.left, card.total).split(' ')[0]} left`
  return (
    <div className={CELL}>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium text-foreground">
          <span className={`h-2 w-2 rounded-sm ${style.dot}`} aria-hidden="true" />
          {card.label}
        </span>
        <span className="text-muted-foreground">of {formatDays(card.total)}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span
          className={`text-3xl font-semibold tabular-nums ${card.isEmpty ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}
        >
          {card.isEmpty ? 'None' : formatLeft(card.left)}
        </span>
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${card.fraction * 100}%` }} />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{card.note}</p>
    </div>
  )
}

function NextLeaveCard({
  next,
  onOpenRequest,
}: {
  next: NextLeaveModel | null
  onOpenRequest: (id: string) => void
}) {
  if (!next) {
    return (
      <div className={CELL}>
        <p className="text-sm font-medium text-foreground">Your next leave</p>
        <p className="mt-3 text-2xl font-semibold text-foreground">Nothing booked</p>
        <p className="mt-3 text-sm text-muted-foreground">Drag across days on the calendar to plan some.</p>
      </div>
    )
  }
  const style = LEAVE_TYPE_STYLE[next.type]
  return (
    <button
      type="button"
      onClick={() => onOpenRequest(next.requestId)}
      className={`${CELL} text-left transition-colors hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary`}
    >
      <p className="text-sm font-medium text-foreground">Your next leave</p>
      <p className="mt-3 flex items-center gap-2 text-2xl font-semibold text-foreground">
        <span className={`h-2 w-2 rounded-sm ${style.dot}`} aria-hidden="true" />
        {next.range}
      </p>
      <p className="mt-3 text-sm text-muted-foreground">
        {next.label} · {next.status}
      </p>
    </button>
  )
}

export function BalanceCards({ cards, next, onOpenRequest }: BalanceCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <BalanceCard key={card.type} card={card} />
      ))}
      <NextLeaveCard next={next} onOpenRequest={onOpenRequest} />
    </div>
  )
}
