import { formatDays } from '@/lib/format-count'
import { formatDate, formatDateRange } from '@/lib/format-date'
import type { LeaveSummary } from '@/lib/time-off/request-summary'

interface RequestSummaryBoxProps {
  summary: LeaveSummary
}

/** "3 working days", "0.5 working days", "1 working day". */
function workingDaysText(days: number): string {
  const [count, word] = formatDays(days).split(' ')
  return `${count} working ${word}`
}

function notCounted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many} not counted`
}

const PROBLEM_TEXT: Partial<Record<NonNullable<LeaveSummary['problem']>, string>> = {
  'end-before-start': 'Your last day off is before your first day off',
  'too-long': 'Pick a shorter range',
}

/** The live summary of the picked dates (steps 1 and 3). */
export function RequestSummaryBox({ summary }: RequestSummaryBoxProps) {
  if (summary.problem === 'missing-dates') return null

  const problemText = summary.problem ? PROBLEM_TEXT[summary.problem] : undefined
  const facts: string[] = []
  if (!problemText) {
    facts.push(workingDaysText(summary.workingDays))
    if (summary.weekendDays > 0) facts.push(notCounted(summary.weekendDays, 'weekend day', 'weekend days'))
    if (summary.holidayDays > 0) facts.push(notCounted(summary.holidayDays, 'holiday', 'holidays'))
    if (summary.sameDayReturn) facts.push('Back the same day')
    else if (summary.returnKey) facts.push(`Back ${formatDate(summary.returnKey)}`)
  }

  return (
    <div className="rounded-lg bg-muted/60 px-4 py-3" aria-live="polite">
      <p className="font-semibold text-foreground">{formatDateRange(summary.startKey, summary.endKey)}</p>
      {problemText ? (
        <p className="mt-1 text-sm text-muted-foreground">{problemText}</p>
      ) : (
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {facts.map((fact, i) => (
            <li key={fact} className="flex items-center gap-3">
              {i > 0 && <span aria-hidden="true">·</span>}
              {fact}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
