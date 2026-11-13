import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { LEAVE_TYPE_TONE } from '@/lib/leave-type-style'
import { nextLeavePhrase, summariseTimeOff, type BalanceInput, type TimeOffPart } from '@/lib/home/time-off'
import type { OwnLeaveRow } from '@/lib/home/needs-you-sources'
import type { Source } from './fetch-source'
import { CardSkeleton, HomeCard } from './HomeCard'
import { Skeleton } from '@/components/ui/skeleton'

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

const SEPARATOR = ' · '

/** One entry per part, in the same order and wording as `partsPhrase`. */
function PartsRow({ parts, phrase }: { parts: TimeOffPart[]; phrase: string }) {
  const texts = phrase.split(SEPARATOR)
  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
      {parts.map((p, i) => (
        <span key={p.type} className="inline-flex items-center gap-1.5">
          {i > 0 ? <span aria-hidden>·</span> : null}
          {p.left > 0 ? (
            <span aria-hidden className={`h-2 w-2 rounded-full ${LEAVE_TYPE_TONE[p.type].dot}`} />
          ) : null}
          <span className={p.left > 0 ? undefined : 'text-destructive'}>{texts[i]}</span>
        </span>
      ))}
    </p>
  )
}

function BigCount({ totalLeft, phrase }: { totalLeft: number; phrase: string }) {
  if (totalLeft <= 0) return <p className="text-lg font-semibold">{phrase}</p>
  const [count, ...rest] = phrase.split(' ')
  return (
    <p>
      <span className="text-3xl font-semibold tabular-nums">{count}</span>{' '}
      <span className="text-muted-foreground">{rest.join(' ')}</span>
    </p>
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
  const footerText = ownLeave === null ? null : !ownLeave.ok ? 'Could not load your leave.' : nextLeavePhrase(s.nextLeave)
  return (
    <HomeCard
      title="Your time off"
      link={LINK}
      footer={
        <>
          {footerText === null ? (
            <Skeleton role="status" aria-label="Loading" className="h-4 w-32" />
          ) : (
            <p className="text-sm text-muted-foreground">{footerText}</p>
          )}
          <RequestButton />
        </>
      }
    >
      <BigCount totalLeft={s.totalLeft} phrase={s.totalPhrase} />
      <Bar parts={s.parts} totalLeft={s.totalLeft} label={s.partsPhrase} />
      <PartsRow parts={s.parts} phrase={s.partsPhrase} />
    </HomeCard>
  )
}
