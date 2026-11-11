'use client'

import { useEffect, useState } from 'react'
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'
import { Reveal } from '@/components/motion/Reveal'
import type { EvaluationsCardView } from '@/lib/weekly/service/dashboard-card'
import { weeklyRequest } from './weekly-api'
import { FormsSection } from './forms/FormsSection'
import { LateFormsSection } from './forms/LateFormsSection'
import { MyMappingCard } from './mapping/MyMappingCard'
import { SelfReviewCard } from './self-review/SelfReviewCard'
import { TeamSelfReviewsCard } from './self-review/TeamSelfReviewsCard'
import { PulseSurveyCard } from './survey/PulseSurveyCard'
import { WeeklyInbox } from './WeeklyInbox'

export function WeeklyEvaluationsPage() {
  // While people are checking their lists, the lists are the task; once questions run, the week comes first.
  const [checkingLists, setCheckingLists] = useState(false)
  useEffect(() => {
    weeklyRequest<{ card: EvaluationsCardView | null }>('/api/weekly/card')
      .then(({ card }) => setCheckingLists(card?.state === 'CHECK_LISTS'))
      .catch(() => setCheckingLists(false))
  }, [])
  return (
    <PageContainer className="space-y-8">
      <PageHeader
        title="Evaluations"
        subtitle="A few short questions each week about the people you work with. Pick the statement that best fits what you have seen; if you have not worked with them on it, say so."
        className="mb-0"
      />
      {/* An earlier quarter HR reopened comes first: it is overdue. */}
      <Reveal><LateFormsSection /></Reveal>
      {checkingLists && <Reveal><MyMappingCard /></Reveal>}
      {/* The weekly set, in the spec's order: the questions, the month's self-evaluation, then the sentiment question last. */}
      <section aria-label="This week" className="space-y-6">
        <Reveal index={1}><WeeklyInbox /></Reveal>
        <Reveal index={2}><SelfReviewCard /></Reveal>
        <Reveal index={3}><PulseSurveyCard /></Reveal>
      </section>
      <Reveal><TeamSelfReviewsCard /></Reveal>
      {!checkingLists && <Reveal><MyMappingCard /></Reveal>}
      <Reveal><FormsSection /></Reveal>
    </PageContainer>
  )
}
