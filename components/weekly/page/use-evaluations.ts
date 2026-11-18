'use client'

import { useCallback, useEffect, useState } from 'react'
import type { EvaluationsCardView } from '@/lib/weekly/service/dashboard-card'
import type { MySelfReview, TeamSelfReviewItem } from '@/lib/weekly/service/self-review'
import type { HistoryResponse, InboxResponse, MyMappingResponse, MySurveyResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

export interface EvaluationsData {
  /** False until the first load finishes. */
  loaded: boolean
  /** Set when the weekly questions themselves could not be loaded. */
  error: string | null
  inbox: InboxResponse | null
  history: HistoryResponse | null
  selfReview: MySelfReview | null
  survey: MySurveyResponse | null
  team: TeamSelfReviewItem[] | null
  mapping: MyMappingResponse | null
  /** People are still checking their lists, so the lists come first. */
  checkingLists: boolean
  /** Goes up on every load, so cards holding their own form state start fresh. */
  version: number
  reload: () => Promise<void>
}

type Loaded = Omit<EvaluationsData, 'reload' | 'version' | 'loaded'>

const EMPTY: Loaded = { error: null, inbox: null, history: null, selfReview: null, survey: null, team: null, mapping: null, checkingLists: false }

/** A source that fails, or that this person does not have, is simply absent: its block shows its empty state. */
async function optional<T>(url: string): Promise<T | null> {
  try {
    return await weeklyRequest<T>(url)
  } catch {
    return null
  }
}

async function loadAll(): Promise<Loaded> {
  let error: string | null = null
  const inboxLoad = weeklyRequest<InboxResponse>('/api/weekly/inbox').catch((e: unknown) => {
    error = errorMessage(e, 'Could not load your questions')
    return null
  })
  const [inbox, history, selfReview, survey, team, mapping, card] = await Promise.all([
    inboxLoad,
    optional<HistoryResponse>('/api/weekly/history'),
    optional<MySelfReview>('/api/weekly/self-review'),
    optional<MySurveyResponse>('/api/weekly/survey'),
    optional<{ items: TeamSelfReviewItem[] }>('/api/weekly/self-review/team'),
    optional<MyMappingResponse>('/api/weekly/mapping'),
    optional<{ card: EvaluationsCardView | null }>('/api/weekly/card'),
  ])
  return { error, inbox, history, selfReview, survey, team: team?.items ?? null, mapping, checkingLists: card?.card?.state === 'CHECK_LISTS' }
}

/** Everything the Evaluations page shows, from the endpoints the earlier page already used. */
export function useEvaluations(): EvaluationsData {
  const [data, setData] = useState<Loaded>(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [version, setVersion] = useState(0)

  const reload = useCallback(async () => {
    const next = await loadAll()
    setData(next)
    setLoaded(true)
    setVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { ...data, loaded, version, reload }
}
