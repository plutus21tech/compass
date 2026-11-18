'use client'

import { useEffect, useMemo, useState } from 'react'
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, localDayKey } from '@/lib/format-date'
import { buildTimeline, pendingQuestions, inboxQueue, tallyWeeks } from '@/lib/weekly/timeline'
import { MyResultsTab } from './page/MyResultsTab'
import { leadsSomeone, MyTeamTab, unreadSelfReviews } from './page/MyTeamTab'
import { RoundTimeline } from './page/RoundTimeline'
import { ThisWeekTab } from './page/ThisWeekTab'
import { useEvaluations } from './page/use-evaluations'

type PageTab = 'week' | 'results' | 'team'
const PANEL_LABEL: Record<PageTab, string> = { week: 'evaluations-tab-week', results: 'evaluations-tab-results', team: 'evaluations-tab-team' }

const TAB = 'inline-flex items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const ACTIVE = 'border-primary text-foreground'
const IDLE = 'border-transparent text-muted-foreground hover:text-foreground'

function Count({ value, label }: { value: number; label: string }) {
  if (value <= 0) return null
  return (
    <span
      aria-label={label}
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground"
    >
      {value}
    </span>
  )
}

function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <Skeleton className="h-32 rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-52 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

/**
 * Evaluations: the round timeline, then tabs that switch everything below them.
 * This week holds the to-dos; My team exists only for people who lead someone.
 */
export function WeeklyEvaluationsPage() {
  const data = useEvaluations()
  const [tab, setTab] = useState<PageTab>('week')
  // /evaluations/weekly#results and #team open those tabs (the results email links to #results).
  useEffect(() => {
    if (window.location.hash === '#team') setTab('team')
    if (window.location.hash === '#results') setTab('results')
  }, [])

  const cycle = data.inbox?.cycle ?? null
  const weeks = useMemo(
    () => (cycle ? buildTimeline(cycle, tallyWeeks(data.history?.groups ?? [])) : []),
    [cycle, data.history]
  )
  const isLead = leadsSomeone(data.mapping, data.team)
  const active: PageTab = tab === 'team' && !isLead ? 'week' : tab
  const questionsDue =
    cycle?.status === 'RUNNING' && data.inbox ? pendingQuestions(inboxQueue(data.inbox.prompts, cycle.currentWeek)).length : 0
  const unread = unreadSelfReviews(data.team)

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        dateLine={formatDate(localDayKey(new Date()))}
        title="Evaluations"
        subtitle="Short weekly questions about the people you work with, your monthly self-evaluation, and your results."
        className="mb-0"
      />
      {!data.loaded ? (
        <Loading />
      ) : (
        <>
          {cycle && <RoundTimeline cycle={cycle} weeks={weeks} />}
          <div role="tablist" aria-label="Evaluations" className="flex gap-6 border-b border-border">
            <button
              type="button"
              role="tab"
              id="evaluations-tab-week"
              aria-selected={active === 'week'}
              aria-controls="evaluations-panel"
              className={`${TAB} ${active === 'week' ? ACTIVE : IDLE}`}
              onClick={() => setTab('week')}
            >
              This week
              <Count value={questionsDue} label={`${questionsDue} questions still due`} />
            </button>
            <button
              type="button"
              role="tab"
              id="evaluations-tab-results"
              aria-selected={active === 'results'}
              aria-controls="evaluations-panel"
              className={`${TAB} ${active === 'results' ? ACTIVE : IDLE}`}
              onClick={() => setTab('results')}
            >
              My results
            </button>
            {isLead && (
              <button
                type="button"
                role="tab"
                id="evaluations-tab-team"
                aria-selected={active === 'team'}
                aria-controls="evaluations-panel"
                className={`${TAB} ${active === 'team' ? ACTIVE : IDLE}`}
                onClick={() => setTab('team')}
              >
                My team
                <Count value={unread} label={`${unread} unread self-evaluations`} />
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Leads only</span>
              </button>
            )}
          </div>
          <div id="evaluations-panel" role="tabpanel" aria-labelledby={PANEL_LABEL[active]}>
            {active === 'week' ? (
              <ThisWeekTab data={data} />
            ) : active === 'results' ? (
              <MyResultsTab results={data.results} />
            ) : (
              <MyTeamTab team={data.team} mapping={data.mapping} progress={data.inbox?.progress ?? []} onGoToThisWeek={() => setTab('week')} />
            )}
          </div>
        </>
      )}
    </PageContainer>
  )
}
