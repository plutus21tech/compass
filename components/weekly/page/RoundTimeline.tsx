import { formatTimestampDate } from '@/lib/format-date'
import { roundSchedule } from '@/lib/weekly/round-schedule'
import type { TimelineWeek, TimelineWeekState } from '@/lib/weekly/timeline'
import type { CycleSummary } from '@/lib/weekly/view-types'
import { cn } from '@/lib/utils'

const STRIPES = 'bg-[repeating-linear-gradient(135deg,hsl(var(--primary))_0_6px,hsl(var(--primary)/0.45)_6px_12px)]'

const BAR: Record<TimelineWeekState, string> = {
  answered: 'bg-primary',
  current: STRIPES,
  future: 'bg-muted',
  'catch-up': 'bg-muted ring-1 ring-inset ring-border',
  missed: 'bg-amber-400 dark:bg-amber-500',
  quiet: 'bg-primary/30',
}

const SPOKEN: Record<TimelineWeekState, string> = {
  answered: 'answered',
  current: 'this week',
  future: 'not started',
  'catch-up': 'catch-up week',
  missed: 'missed',
  quiet: 'no questions',
}

function Key({ className, children }: { className: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2 w-4 rounded-full', className)} aria-hidden />
      {children}
    </span>
  )
}

/** The round at a glance: every week, where you are, and when it closes. */
export function RoundTimeline({ cycle, weeks }: { cycle: CycleSummary; weeks: TimelineWeek[] }) {
  const closes = roundSchedule(new Date(cycle.weekOneStartsOn), cycle.questionWeeks).concludesOn
  const running = cycle.status === 'RUNNING'
  const missed = weeks.some((w) => w.state === 'missed')
  const position = running
    ? `Week ${Math.min(cycle.currentWeek, weeks.length)} of ${weeks.length} · round closes ${formatTimestampDate(closes)}`
    : cycle.status === 'CLOSED'
      ? 'Round closed'
      : `Starts ${formatTimestampDate(cycle.weekOneStartsOn)}`

  return (
    <section aria-label="Round timeline" className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold text-foreground">{cycle.periodName} round</h2>
        <p className="text-sm text-muted-foreground">{position}</p>
      </div>
      <ol className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
        {weeks.map((w) => (
          <li
            key={w.week}
            aria-current={w.state === 'current' ? 'step' : undefined}
            aria-label={`${w.label}, ${formatTimestampDate(w.startsOn)}, ${SPOKEN[w.state]}`}
            className="min-w-[4.25rem] flex-1"
          >
            <div className={cn('h-2 rounded-full', BAR[w.state])} />
            <p className={cn('mt-2 text-xs font-medium', w.state === 'current' ? 'text-primary' : 'text-foreground')}>{w.label}</p>
            <p className="text-[11px] text-muted-foreground">{formatTimestampDate(w.startsOn)}</p>
            {w.state === 'current' && <p className="text-[11px] font-medium text-primary">You are here</p>}
            {w.state === 'missed' && <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">Missed</p>}
          </li>
        ))}
        <li aria-label="Results, shared after the round closes" className="min-w-[4.25rem] flex-1">
          <div className="h-2 rounded-full bg-emerald-200 dark:bg-emerald-500/30" />
          <p className="mt-2 text-xs font-medium text-foreground">Results</p>
          <p className="text-[11px] text-muted-foreground">After the round</p>
        </li>
      </ol>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <Key className={BAR.answered}>Answered</Key>
        <Key className={BAR.current}>This week</Key>
        {missed && <Key className={BAR.missed}>Missed</Key>}
        <span>New questions every Monday, due Friday</span>
        <span>Catch-up: no new questions, finish anything missed</span>
      </div>
    </section>
  )
}
