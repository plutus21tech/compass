'use client'

import { useEffect, useState } from 'react'
import { doneThisWeek, recentUpdates, type DoneItem, type TaskActivityRow, type TaskUpdate } from '@/lib/home/extras'
import { pickOpenTasks, type HomeTask } from '@/lib/home/my-work'
import { fetchSource, type Source } from './fetch-source'

export interface HomeExtras {
  /** Finished since Monday; null until loaded. */
  done: DoneItem[] | null
  /** Changes other people made to the viewer's open tasks; null until loaded. */
  updates: { shown: TaskUpdate[]; more: number } | null
}

const object = (body: unknown): Record<string, unknown> | null =>
  body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : null

const pickInbox = (body: unknown): { weekSubmittedAt: string | null } | null => {
  const data = object(body)
  if (!data) return null
  return { weekSubmittedAt: typeof data.weekSubmittedAt === 'string' ? data.weekSubmittedAt : null }
}

const pickSelfReviews = (body: unknown): Array<{ monthName: string; submittedAt: string }> | null => {
  const history = object(body)?.history
  if (!Array.isArray(history)) return null
  return history.flatMap((raw) => {
    const row = object(raw)
    return row && typeof row.monthName === 'string' && typeof row.submittedAt === 'string'
      ? [{ monthName: row.monthName, submittedAt: row.submittedAt }]
      : []
  })
}

const pickActivities = (body: unknown): TaskActivityRow[] | null => {
  const activities = object(body)?.activities
  return Array.isArray(activities) ? (activities as TaskActivityRow[]) : null
}

/** Where evaluations are switched off these answer 404, which simply means "nothing to show". */
async function loadDone(todayKey: string): Promise<DoneItem[]> {
  const [inbox, reviews] = await Promise.all([
    fetchSource('/api/weekly/inbox', pickInbox),
    fetchSource('/api/weekly/self-review', pickSelfReviews),
  ])
  return doneThisWeek(
    { weekSubmittedAt: inbox.ok ? inbox.data.weekSubmittedAt : null, selfReviews: reviews.ok ? reviews.data : [] },
    todayKey
  )
}

async function loadUpdates(tasks: readonly HomeTask[], viewerId: string): Promise<HomeExtras['updates']> {
  const { shown } = pickOpenTasks(tasks)
  const perTask = await Promise.all(
    shown.map(async (task) => {
      const res = await fetchSource(`/api/projects/${task.project.id}/task-activities?taskId=${encodeURIComponent(task.id)}`, pickActivities)
      return { taskId: task.id, activities: res.ok ? res.data : [] }
    })
  )
  return recentUpdates(perTask, viewerId)
}

/** The smaller Home blocks, loaded after the main ones so they never hold the page up. */
export function useHomeExtras(todayKey: string, tasks: Source<HomeTask[]> | null, viewerId: string): HomeExtras {
  const [done, setDone] = useState<DoneItem[] | null>(null)
  const [updates, setUpdates] = useState<HomeExtras['updates']>(null)

  useEffect(() => {
    let cancelled = false
    loadDone(todayKey)
      .then((next) => { if (!cancelled) setDone(next) })
      .catch((error: unknown) => console.error('[home] extras failed', error))
    return () => { cancelled = true }
  }, [todayKey])

  const taskList = tasks?.ok ? tasks.data : null
  useEffect(() => {
    if (!taskList || !viewerId) return undefined
    let cancelled = false
    loadUpdates(taskList, viewerId)
      .then((next) => { if (!cancelled) setUpdates(next) })
      .catch((error: unknown) => console.error('[home] task updates failed', error))
    return () => { cancelled = true }
  }, [taskList, viewerId])

  return { done, updates }
}
