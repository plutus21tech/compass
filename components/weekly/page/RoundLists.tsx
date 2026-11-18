'use client'

import { useState } from 'react'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { SoftState } from '@/components/composed/SoftState'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatTimestampDate } from '@/lib/format-date'
import type { EvaluateeProgress, HistoryGroup, MyMappingResponse, PersonRef } from '@/lib/weekly/view-types'
import { HistoryList } from '../HistoryList'
import { MyMappingCard } from '../mapping/MyMappingCard'
import { FooterCard, SectionTitle } from './TodoCard'

const ROWS_SHOWN = 5
const ANSWERED: ReadonlySet<string> = new Set(['SUBMITTED', 'NOT_OBSERVED'])

export interface AnsweredRow {
  key: string
  week: number
  /** The topics answered that week about this person. */
  topics: string
  person: string
  /** ISO instant of the latest answer; null when all were "not observed". */
  answeredAt: string | null
}

/** One row per week and person with something answered, newest week first. */
export function answeredRows(groups: readonly HistoryGroup[]): AnsweredRow[] {
  const rows = new Map<string, AnsweredRow & { topicSet: Set<string> }>()
  for (const group of groups) {
    for (const entry of group.entries) {
      if (!ANSWERED.has(entry.status)) continue
      const key = `${entry.weekIndex}:${group.evaluatee.id}:${group.perspective}`
      const row = rows.get(key) ?? { key, week: entry.weekIndex, topics: '', person: group.evaluatee.name, answeredAt: null, topicSet: new Set<string>() }
      row.topicSet.add(entry.topic)
      if (entry.submittedAt && (!row.answeredAt || entry.submittedAt > row.answeredAt)) row.answeredAt = entry.submittedAt
      rows.set(key, row)
    }
  }
  return [...rows.values()]
    .map(({ topicSet, ...row }) => ({ ...row, topics: [...topicSet].join(', ') }))
    .sort((a, b) => b.week - a.week || a.person.localeCompare(b.person))
}

/** Answered and total questions for the whole round so far. */
export function roundTotals(progress: readonly EvaluateeProgress[]): { answered: number; total: number } {
  return progress.reduce((sum, p) => ({ answered: sum.answered + p.answered, total: sum.total + p.total }), { answered: 0, total: 0 })
}

/** One person's answered and total questions across every way the viewer evaluates them. */
export function progressFor(progress: readonly EvaluateeProgress[], personId: string): { answered: number; total: number } | null {
  const mine = progress.filter((p) => p.evaluatee.id === personId)
  return mine.length === 0 ? null : roundTotals(mine)
}

interface AnsweredThisRoundProps {
  groups: HistoryGroup[]
  progress: EvaluateeProgress[]
  /** Called when the answers dialog closes, since an answer may have been edited in it. */
  onChanged: () => Promise<void>
}

export function AnsweredThisRound({ groups, progress, onChanged }: AnsweredThisRoundProps) {
  const [open, setOpen] = useState(false)
  const rows = answeredRows(groups)
  const totals = roundTotals(progress)
  const close = (next: boolean) => {
    setOpen(next)
    if (!next) void onChanged()
  }
  return (
    <section aria-labelledby="answered-round-heading" className="flex flex-col">
      <SectionTitle id="answered-round-heading" title="Answered this round" note="Only you and HR see your answers" />
      <FooterCard
        className="flex-1"
        status={totals.total > 0 ? `${totals.answered} of ${totals.total} answered this round` : 'Nothing asked yet'}
        action={rows.length > 0 ? <Button variant="outline" size="sm" onClick={() => setOpen(true)}>View all</Button> : undefined}
      >
        {rows.length === 0 ? (
          <SoftState title="Nothing answered yet" description="Your answers show up here once you send them. Only you and HR see them." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.slice(0, ROWS_SHOWN).map((row) => (
              <li key={row.key} className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-3 px-4 py-3">
                <span className="text-xs font-medium text-muted-foreground">Week {row.week}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{row.topics}</p>
                  <p className="text-xs text-muted-foreground">
                    About {row.person}
                    {row.answeredAt ? ` · answered ${formatTimestampDate(row.answeredAt)}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </FooterCard>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Your answers this round</DialogTitle>
            <DialogDescription>You can change an answer until the Sunday of its week.</DialogDescription>
          </DialogHeader>
          <HistoryList />
        </DialogContent>
      </Dialog>
    </section>
  )
}

function PeopleRow({ label, people, progress }: { label: string; people: PersonRef[]; progress: EvaluateeProgress[] }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 px-4 py-3">
      <span className="pt-1 text-xs font-medium text-muted-foreground">{label}</span>
      {people.length === 0 ? (
        <p className="pt-0.5 text-sm text-muted-foreground">None this round</p>
      ) : (
        <ul className="space-y-2">
          {people.map((person) => {
            const done = progressFor(progress, person.id)
            return (
              <li key={person.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <UserAvatar name={person.name} size="xs" />
                  <span className="truncate text-sm font-medium text-foreground">{person.name}</span>
                </span>
                {done && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{done.answered} of {done.total} answered</span>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

interface WhoYouEvaluateProps {
  mapping: MyMappingResponse | null
  progress: EvaluateeProgress[]
  /** Called when the lists dialog closes, since a change may have been asked for in it. */
  onChanged: () => Promise<void>
}

export function WhoYouEvaluate({ mapping, progress, onChanged }: WhoYouEvaluateProps) {
  const [open, setOpen] = useState(false)
  const nobody = !mapping || mapping.leads.length + mapping.reports.length + mapping.peers.length === 0
  // As a lead, or as the peer a change is about: requests that need this person.
  const waiting = mapping ? mapping.toReview.length + mapping.aboutMe.filter((r) => r.status === 'PENDING' && !r.peerReply).length : 0
  const close = (next: boolean) => {
    setOpen(next)
    if (!next) void onChanged()
  }
  return (
    <section aria-labelledby="who-evaluate-heading" className="flex flex-col">
      <SectionTitle id="who-evaluate-heading" title="Who you evaluate" note="Fixed for this round" />
      <FooterCard
        className="flex-1"
        status={
          waiting > 0 ? (
            <span className="font-medium text-amber-700 dark:text-amber-300">
              {waiting} list {waiting === 1 ? 'change is' : 'changes are'} waiting for you
            </span>
          ) : (
            'Something wrong?'
          )
        }
        action={
          mapping ? (
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>{waiting > 0 ? 'Review' : 'Ask for a change'}</Button>
          ) : undefined
        }
      >
        {nobody || !mapping ? (
          <SoftState title="No one to evaluate this round" description="HR assigns people each round." />
        ) : (
          <div className="divide-y divide-border">
            <PeopleRow label="Your lead" people={mapping.leads} progress={progress} />
            <PeopleRow label="Your team" people={mapping.reports} progress={progress} />
            <PeopleRow label="Your peers" people={mapping.peers} progress={progress} />
          </div>
        )}
      </FooterCard>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Your evaluation lists</DialogTitle>
            <DialogDescription>Ask for a person to be added or removed. Your lead or HR decides.</DialogDescription>
          </DialogHeader>
          <MyMappingCard />
        </DialogContent>
      </Dialog>
    </section>
  )
}
