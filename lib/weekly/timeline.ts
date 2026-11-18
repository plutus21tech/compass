// What the Evaluations page shows about a round, worked out from what the existing endpoints already return.
// Display only: nothing here decides what can be answered or how anything is scored.
import { weekDueAt, weekStartsAt } from './calendar'
import type { CycleSummary, HistoryGroup, InboxPrompt } from './view-types'

export type TimelineWeekState = 'answered' | 'current' | 'future' | 'missed' | 'catch-up' | 'quiet'

export interface TimelineWeek {
  week: number
  /** "Week 3", or "Catch-up" for the closing weeks. */
  label: string
  kind: 'question' | 'catch-up'
  state: TimelineWeekState
  startsOn: Date
  dueOn: Date
}

/** Per week: questions still unanswered, and questions answered (or marked not observed). */
export interface WeekTally { open: number; done: number }

const UNANSWERED: ReadonlySet<string> = new Set(['OPEN', 'DRAFT', 'EXPIRED'])
const ANSWERED: ReadonlySet<string> = new Set(['SUBMITTED', 'NOT_OBSERVED'])

/** Comment questions are optional, so only the scored questions decide whether a week was answered. */
export function tallyWeeks(groups: readonly HistoryGroup[]): Map<number, WeekTally> {
  const tallies = new Map<number, WeekTally>()
  for (const group of groups) {
    for (const entry of group.entries) {
      if (entry.kind !== 'STANDARD') continue
      const tally = tallies.get(entry.weekIndex) ?? { open: 0, done: 0 }
      if (UNANSWERED.has(entry.status)) tallies.set(entry.weekIndex, { ...tally, open: tally.open + 1 })
      else if (ANSWERED.has(entry.status)) tallies.set(entry.weekIndex, { ...tally, done: tally.done + 1 })
    }
  }
  return tallies
}

type TimelineCycle = Pick<CycleSummary, 'weekOneStartsOn' | 'questionWeeks' | 'totalWeeks' | 'currentWeek' | 'status'>

function stateOf(week: number, kind: TimelineWeek['kind'], cycle: TimelineCycle, tally: WeekTally | undefined): TimelineWeekState {
  const running = cycle.status === 'RUNNING'
  if (running && week === cycle.currentWeek) return 'current'
  if (running && week > cycle.currentWeek) return kind === 'catch-up' ? 'catch-up' : 'future'
  if (cycle.status === 'SETUP') return kind === 'catch-up' ? 'catch-up' : 'future'
  if (tally && tally.open > 0) return 'missed'
  if (tally && tally.done > 0) return 'answered'
  return kind === 'catch-up' ? 'catch-up' : 'quiet'
}

/** One entry per week of the round: the question weeks, then the catch-up weeks. */
export function buildTimeline(cycle: TimelineCycle, tallies: ReadonlyMap<number, WeekTally>): TimelineWeek[] {
  const weekOne = new Date(cycle.weekOneStartsOn)
  return Array.from({ length: Math.max(cycle.totalWeeks, cycle.questionWeeks) }, (_, i) => {
    const week = i + 1
    const kind: TimelineWeek['kind'] = week > cycle.questionWeeks ? 'catch-up' : 'question'
    return {
      week,
      label: kind === 'catch-up' ? 'Catch-up' : `Week ${week}`,
      kind,
      state: stateOf(week, kind, cycle, tallies.get(week)),
      startsOn: weekStartsAt(weekOne, week),
      dueOn: weekDueAt(weekOne, week),
    }
  })
}

/** The questions to walk through, one at a time: missed ones first (oldest first), then this week's by person. */
export function inboxQueue(prompts: readonly InboxPrompt[], week: number): InboxPrompt[] {
  const carried = (p: InboxPrompt) => p.weekIndex < week && p.status !== 'SUBMITTED'
  const missed = prompts.filter(carried).sort((a, b) => a.weekIndex - b.weekIndex)
  const current = prompts
    .filter((p) => !carried(p))
    .sort((a, b) => a.evaluatee.name.localeCompare(b.evaluatee.name) || a.perspective.localeCompare(b.perspective))
  return [...missed, ...current]
}

/** Scored questions still without an answer; the week can be submitted once there are none. */
export function pendingQuestions(queue: readonly InboxPrompt[]): InboxPrompt[] {
  return queue.filter((p) => p.kind === 'STANDARD' && p.status !== 'SUBMITTED')
}
