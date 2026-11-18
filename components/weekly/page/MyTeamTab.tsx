'use client'

import { SoftState } from '@/components/composed/SoftState'
import { Button } from '@/components/ui/button'
import type { TeamSelfReviewItem } from '@/lib/weekly/service/self-review'
import type { EvaluateeProgress, MyMappingResponse } from '@/lib/weekly/view-types'
import { TeamSelfReviewsCard } from '../self-review/TeamSelfReviewsCard'
import { progressFor } from './RoundLists'
import { FooterCard, SectionTitle } from './TodoCard'

interface MyTeamTabProps {
  team: TeamSelfReviewItem[] | null
  mapping: MyMappingResponse | null
  progress: EvaluateeProgress[]
  onGoToThisWeek: () => void
}

/** Whether the person leads anyone this round: only then does the My team tab exist. */
export function leadsSomeone(mapping: MyMappingResponse | null, team: TeamSelfReviewItem[] | null): boolean {
  return (mapping?.reports.length ?? 0) > 0 || (team?.length ?? 0) > 0
}

export function unreadSelfReviews(team: TeamSelfReviewItem[] | null): number {
  return (team ?? []).filter((item) => !item.readAt).length
}

/** For leads: the self-evaluations their team sent, and how far along they are evaluating each person. */
export function MyTeamTab({ team, mapping, progress, onGoToThisWeek }: MyTeamTabProps) {
  const reports = mapping?.reports ?? []
  return (
    <div className="space-y-8">
      <p className="rounded-lg bg-primary/10 px-4 py-3 text-sm text-foreground">Only you and HR see this tab.</p>

      <section aria-labelledby="team-self-heading">
        <SectionTitle id="team-self-heading" title="Self-evaluations from your team" note="Sent to you and HR" />
        {team && team.length > 0 ? (
          <TeamSelfReviewsCard />
        ) : (
          <div className="flex rounded-xl border border-border bg-card">
            <SoftState title="Nothing sent yet" description="Self-evaluations from your team show up here when they send them." />
          </div>
        )}
      </section>

      <section aria-labelledby="team-progress-heading">
        <SectionTitle id="team-progress-heading" title="Your progress evaluating your team" />
        <FooterCard
          status="Questions about your team appear in This week"
          action={<Button variant="outline" size="sm" onClick={onGoToThisWeek}>Go to This week</Button>}
        >
          {reports.length === 0 ? (
            <SoftState title="No team members this round" description="HR assigns who you evaluate each round." />
          ) : (
            <ul className="divide-y divide-border">
              {reports.map((person) => {
                const done = progressFor(progress, person.id)
                const percent = done && done.total > 0 ? Math.round((done.answered / done.total) * 100) : 0
                return (
                  <li key={person.id} className="grid grid-cols-1 items-center gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{person.name}</p>
                      {person.position ? <p className="truncate text-xs text-muted-foreground">{person.position}</p> : null}
                    </div>
                    <div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                      </div>
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                        {done ? `${done.answered} of ${done.total} answered` : 'No questions yet'}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </FooterCard>
      </section>
    </div>
  )
}
