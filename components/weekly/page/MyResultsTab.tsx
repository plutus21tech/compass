'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'
import { SoftState } from '@/components/composed/SoftState'
import { formatTimestampDate } from '@/lib/format-date'
import { lowestGroup, scalePercent, scoreChange, type MyResultQuarter, type MyResultsResponse } from '@/lib/weekly/my-results'
import { cn } from '@/lib/utils'
import { FooterCard, SectionTitle } from './TodoCard'

const SCALE = ['1 Does not meet', '2 Meets', '3 Exceeds', '4 Transforming']
const TREND_SHOWN = 3
const LOW_SCORE = 3

const score2 = (value: number): string => value.toFixed(2)

function Change({ change, since }: { change: number | null; since: string | undefined }) {
  if (change === null || !since) return null
  if (change === 0) return <span className="text-sm text-muted-foreground">Same as {since}</span>
  const up = change > 0
  return (
    <span className={cn('text-sm font-medium', up ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
      {up ? '▲' : '▼'} {score2(Math.abs(change))} since {since}
    </span>
  )
}

/** One bar per quarter, oldest on the left; the chosen quarter is solid. */
function Trend({ quarters, selected }: { quarters: MyResultQuarter[]; selected: number }) {
  const shown = quarters.slice(selected, selected + TREND_SHOWN).reverse()
  if (shown.length < 2) return null
  return (
    <div className="flex items-end gap-2" aria-label="Score by quarter">
      {shown.map((q) => (
        <div key={q.periodId} className="flex w-12 flex-col items-center gap-1">
          <span className="text-[11px] tabular-nums text-muted-foreground">{score2(q.score)}</span>
          <div className="flex h-14 w-full items-end rounded bg-muted">
            <div
              className={cn('w-full rounded', q.periodId === quarters[selected].periodId ? 'bg-primary' : 'bg-primary/30')}
              style={{ height: `${Math.max(8, (q.score / 4) * 100)}%` }}
            />
          </div>
          <span className="max-w-full truncate text-[11px] text-muted-foreground">{q.periodName}</span>
        </div>
      ))}
    </div>
  )
}

function Scale({ score }: { score: number }) {
  const at = scalePercent(score)
  return (
    <div>
      <div className="relative pt-5">
        <span className="absolute top-0 -translate-x-1/2 text-xs font-semibold tabular-nums text-foreground" style={{ left: `${at}%` }}>
          {score2(score)}
        </span>
        <div className="grid grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2 rounded-full bg-muted" />
          ))}
        </div>
        <span className="absolute top-[1.125rem] h-3 w-1 -translate-x-1/2 rounded-full bg-primary" style={{ left: `${at}%` }} aria-hidden />
      </div>
      <div className="mt-2 flex justify-between gap-2 text-[11px] text-muted-foreground">
        {SCALE.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  )
}

function OverallCard({ quarters, selected }: { quarters: MyResultQuarter[]; selected: number }) {
  const quarter = quarters[selected]
  const focus = lowestGroup(quarter.groups)
  return (
    <section aria-labelledby="overall-heading" className="flex flex-col">
      <SectionTitle id="overall-heading" title={`${quarter.periodName} overall`} note="Out of 4" />
      <FooterCard
        className="flex-1"
        status={
          quarter.emailedAt ? (
            <span className="inline-flex items-center gap-2">
              <Mail className="h-4 w-4" aria-hidden /> Also sent to your email on {formatTimestampDate(quarter.emailedAt)}
            </span>
          ) : (
            'Released by HR'
          )
        }
      >
        <div className="flex flex-1 flex-col gap-5 p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-2">
              <p>
                <span className="text-5xl font-bold tabular-nums tracking-tight text-foreground">{score2(quarter.score)}</span>
                <span className="ml-2 text-sm text-muted-foreground">of 4</span>
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {quarter.band && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-medium text-primary">{quarter.band}</span>
                )}
                <Change change={scoreChange(quarters, selected)} since={quarters[selected + 1]?.periodName} />
              </div>
            </div>
            <Trend quarters={quarters} selected={selected} />
          </div>
          <Scale score={quarter.score} />
          {quarter.band && quarter.bandDescription && (
            <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-foreground">
              <span className="font-semibold">{quarter.band}:</span> {quarter.bandDescription}
            </p>
          )}
          {focus && (
            <div className="mt-auto">
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                Focus for next quarter
              </span>
              <p className="mt-2 font-semibold text-foreground">{focus.label}</p>
              <p className="text-sm text-muted-foreground">Your lowest score this quarter: {score2(focus.score)}</p>
            </div>
          )}
        </div>
      </FooterCard>
    </section>
  )
}

function GroupsCard({ quarter }: { quarter: MyResultQuarter }) {
  return (
    <section aria-labelledby="groups-heading" className="flex flex-col">
      <SectionTitle id="groups-heading" title="Scores by group" note="Who the scores came from, and how much each counts" />
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        {quarter.groups.length === 0 ? (
          <SoftState title="No group scores for this quarter" description="Only the overall score was recorded." />
        ) : (
          <ul className="flex-1 divide-y divide-border">
            {quarter.groups.map((group) => (
              <li key={group.key} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_3.5rem] items-center gap-4 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{group.label}</p>
                  <p className="text-xs text-muted-foreground">{group.weightPercent}% of total</p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(group.score / 4) * 100}%` }} />
                </div>
                <p
                  className={cn(
                    'text-right text-sm font-semibold tabular-nums',
                    group.score < LOW_SCORE ? 'text-amber-700 dark:text-amber-300' : 'text-foreground'
                  )}
                >
                  {score2(group.score)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-4 border-t border-border bg-muted/40 px-4 py-3.5">
          <div>
            <p className="text-sm font-semibold text-foreground">Weighted total</p>
            <p className="text-xs text-muted-foreground">Your overall score</p>
          </div>
          <p className="text-right text-sm font-bold tabular-nums text-foreground">{score2(quarter.score)}</p>
        </div>
      </div>
    </section>
  )
}

/** A person's own released results: the overall score with its trend, and the score from each group. */
export function MyResultsTab({ results }: { results: MyResultsResponse | null }) {
  const [selected, setSelected] = useState(0)
  const quarters = results?.quarters ?? []
  const preparing = results?.preparing ?? null

  if (quarters.length === 0) {
    return (
      <div className="flex rounded-xl border border-border bg-card py-6">
        <SoftState
          title={preparing ? `${preparing} results are being prepared` : 'No results yet'}
          description="Your results show up here, and by email, once HR releases them after a round closes."
        />
      </div>
    )
  }
  const index = Math.min(selected, quarters.length - 1)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap rounded-lg bg-muted p-0.5" role="group" aria-label="Quarter">
          {quarters.map((q, i) => (
            <button
              key={q.periodId}
              type="button"
              aria-pressed={i === index}
              className={cn(
                'rounded-md px-3 py-1 text-sm transition-colors',
                i === index ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setSelected(i)}
            >
              {q.periodName}
            </button>
          ))}
        </div>
        {preparing && <p className="text-sm text-muted-foreground">{preparing} results are being prepared</p>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <OverallCard quarters={quarters} selected={index} />
        <GroupsCard quarter={quarters[index]} />
      </div>
    </div>
  )
}
