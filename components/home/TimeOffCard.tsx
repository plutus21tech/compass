import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { LEAVE_TYPE_LABEL, LEAVE_TYPE_TONE } from '@/lib/leave-type-style'
import { nextLeavePhrase, summariseTimeOff, type BalanceInput, type TimeOffPart } from '@/lib/home/time-off'
import type { OwnLeaveRow } from '@/lib/home/needs-you-sources'
import type { Source } from './fetch-source'
import { CardSkeleton, HomeCard } from './HomeCard'

interface TimeOffCardProps {
  balance: Source<BalanceInput> | null
  ownLeave: Source<OwnLeaveRow[]> | null
  todayKey: string
}

const LINK = { label: 'History', href: '/leave#my-requests' }

function RequestButton() {
  return (
    <Button asChild>
      <Link href="/leave?request=1">Request leave</Link>
    </Button>
  )
}

function Bar({ parts, totalLeft, label }: { parts: TimeOffPart[]; totalLeft: number; label: string }) {
  const active = parts.filter((p) => p.left > 0)
  return (
    <div role="img" aria-label={label} className="mt-3 flex h-1.5 gap-px overflow-hidden rounded-full bg-muted">
      {active.map((p) => (
        <div
          key={p.type}
          className={LEAVE_TYPE_TONE[p.type].bar}
          style={{ width: `${(p.left / totalLeft) * 100}%` }}
        />
      ))}
    </div>
  )
}

function leftText(left: number): string {
  return String(Number.isInteger(left) ? left : Math.round(left * 10) / 10)
}

function PartsRow({ parts }: { parts: TimeOffPart[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
      {parts.map((p) => {
        const label = LEAVE_TYPE_LABEL[p.type].toLowerCase()
        if (p.left <= 0) {
          return (
            <li key={p.type} className="text-destructive">
              No {label} left
            </li>
          )
        }
        return (
          <li key={p.type} className="flex items-center gap-1.5">
            <span aria-hidden className={`h-2 w-2 rounded-full ${LEAVE_TYPE_TONE[p.type].dot}`} />
            {`${leftText(p.left)} ${label}`}
          </li>
        )
      })}
    </ul>
  )
}

export function TimeOffCard({ balance, ownLeave, todayKey }: TimeOffCardProps) {
  if (balance === null) {
    return (
      <HomeCard title="Your time off" link={LINK}>
        <CardSkeleton />
      </HomeCard>
    )
  }
  if (!balance.ok) {
    return (
      <HomeCard title="Your time off" link={LINK} footer={<RequestButton />}>
        <p className="text-sm text-muted-foreground">Could not load your balance.</p>
      </HomeCard>
    )
  }
  const own = ownLeave?.ok ? ownLeave.data : []
  const s = summariseTimeOff(balance.data, own, todayKey)
  const footerText = ownLeave && !ownLeave.ok ? 'Could not load your leave.' : nextLeavePhrase(s.nextLeave)
  return (
    <HomeCard
      title="Your time off"
      link={LINK}
      footer={
        <>
          <p className="text-sm text-muted-foreground">{footerText}</p>
          <RequestButton />
        </>
      }
    >
      <p>
        <span className="text-3xl font-semibold tabular-nums">{leftText(s.totalLeft)}</span>{' '}
        <span className="text-muted-foreground">{s.totalLeft === 1 ? 'day left' : 'days left'}</span>
      </p>
      <Bar parts={s.parts} totalLeft={s.totalLeft} label={s.partsPhrase} />
      <PartsRow parts={s.parts} />
    </HomeCard>
  )
}
