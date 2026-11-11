'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { formatDate } from '@/lib/format-date'
import { homeSummary } from '@/lib/home/summary'
import type { HomeOverview, OutPerson, TeamUpcomingRow } from '@/lib/home/out-today'
import type { Source } from './fetch-source'
import { CardSkeleton, HomeCard } from './HomeCard'
import { OutTodayDialog } from './OutTodayDialog'

const AVATARS_SHOWN = 4

interface OutTodayCardProps {
  overview: Source<HomeOverview> | null
  teamUpcoming: Source<TeamUpcomingRow[]> | null
  /** The viewer is left out of the count and the list, as on the Out Today card they know. */
  viewerId: string
}

const LINK = { label: 'Team calendar', href: '/leave' }

function departmentLine(overview: HomeOverview): { text: string; allIn: boolean } | null {
  const text = homeSummary({
    needsYou: null,
    department: overview.department,
    departmentOutToday: overview.departmentOutToday,
  })
  return text ? { text, allIn: overview.departmentOutToday === 0 } : null
}

function teamLeavePhrase(rows: TeamUpcomingRow[]): string {
  const n = new Set(rows.map((r) => r.employee.id)).size
  return n === 1 ? '1 person on your team has leave coming up' : `${n} people on your team have leave coming up`
}

interface BodyProps {
  overview: HomeOverview
  upcoming: TeamUpcomingRow[]
  people: OutPerson[]
}

function Body({ overview, upcoming, people }: BodyProps) {
  const dept = departmentLine(overview)
  const next = overview.nextOutInDepartment
  return (
    <div>
      {people.length === 0 ? (
        <p className="text-lg font-semibold">Nobody is out today.</p>
      ) : (
        <p>
          <span className="text-3xl font-semibold tabular-nums">{people.length}</span>{' '}
          <span className="text-muted-foreground">{people.length === 1 ? 'person out' : 'people out'}</span>
        </p>
      )}
      <p className="mt-2 text-sm text-muted-foreground">
        {dept ? (
          <span className={dept.allIn ? 'text-emerald-600 dark:text-emerald-400' : undefined}>{dept.text}</span>
        ) : null}
        {next ? ` ${next.name.split(' ')[0]} is next out on ${formatDate(next.startDate)}.` : null}
      </p>
      {upcoming.length > 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">{teamLeavePhrase(upcoming)}</p>
      ) : null}
    </div>
  )
}

function Footer({ people, onSeeWho }: { people: OutPerson[]; onSeeWho: () => void }) {
  const shown = people.slice(0, AVATARS_SHOWN)
  const extra = people.length - shown.length
  return (
    <>
      <div className="flex items-center -space-x-1.5">
        {shown.map((p) => (
          <UserAvatar key={p.id} name={p.name} size="xs" className="ring-2 ring-card" />
        ))}
        {extra > 0 ? (
          <span className="inline-flex h-6 items-center rounded-full bg-muted px-1.5 text-[10px] font-semibold ring-2 ring-card">
            +{extra}
          </span>
        ) : null}
      </div>
      <Button variant="outline" onClick={onSeeWho}>
        See who
      </Button>
    </>
  )
}

export function OutTodayCard({ overview, teamUpcoming, viewerId }: OutTodayCardProps) {
  const [open, setOpen] = useState(false)
  if (overview === null) {
    return (
      <HomeCard title="Out today" link={LINK}>
        <CardSkeleton />
      </HomeCard>
    )
  }
  if (!overview.ok) {
    return (
      <HomeCard title="Out today" link={LINK}>
        <p className="text-sm text-muted-foreground">Could not load who is out today.</p>
      </HomeCard>
    )
  }
  const data = overview.data
  const people = data.outToday.people.filter((p) => p.id !== viewerId)
  const upcoming = teamUpcoming?.ok ? teamUpcoming.data : []
  return (
    <>
      <HomeCard title="Out today" link={LINK} footer={<Footer people={people} onSeeWho={() => setOpen(true)} />}>
        <Body overview={data} upcoming={upcoming} people={people} />
      </HomeCard>
      <OutTodayDialog open={open} onOpenChange={setOpen} people={people} teamUpcoming={upcoming} />
    </>
  )
}
