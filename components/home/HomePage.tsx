'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { formatDate } from '@/lib/format-date'
import { greetingFor } from '@/lib/home/time'
import { homeSummary, needsYouSummaryCount } from '@/lib/home/summary'
import type { HomeTask } from '@/lib/home/my-work'
import { HolidayCard } from './HolidayCard'
import { HomeTaskSheet } from './HomeTaskSheet'
import { MyWorkPanel } from './MyWorkPanel'
import { NeedsYouList } from './NeedsYouList'
import { OutTodayCard } from './OutTodayCard'
import { TimeOffCard } from './TimeOffCard'
import { useHomeData } from './use-home-data'
import { useHomeExtras } from './use-home-extras'

const FALLBACK_NAME = 'there'

function firstNameOf(name: string | undefined): string {
  const first = name?.trim().split(/\s+/)[0]
  return first ? first : FALLBACK_NAME
}

/** The browser clock decides the greeting, so it is set after mount to keep server and client markup equal. */
function useGreeting(name: string | undefined): string {
  const [hour, setHour] = useState<number | null>(null)
  useEffect(() => {
    setHour(new Date().getHours())
  }, [])
  const first = firstNameOf(name)
  return hour === null ? `Hello, ${first}` : `${greetingFor(hour)}, ${first}`
}

export function HomePage() {
  const user = useLayoutUser()
  const data = useHomeData(user)
  const greeting = useGreeting(user?.name)
  const [openTask, setOpenTask] = useState<HomeTask | null>(null)
  const closeTask = useCallback(() => setOpenTask(null), [])
  const { reloadTasks } = data
  const onChanged = useCallback(() => reloadTasks(), [reloadTasks])

  const overview = data.overview?.ok ? data.overview.data : null
  const summary = homeSummary({
    needsYou: needsYouSummaryCount(data.needsYou),
    department: overview?.department ?? null,
    departmentOutToday: overview?.departmentOutToday ?? null,
  })
  const viewerId = user?.id ?? ''
  const extras = useHomeExtras(data.todayKey, data.tasks, viewerId)

  // One click gives a task with no due date one, through the same update the task panel uses.
  const setDue = useCallback(
    async (task: HomeTask, dayKey: string) => {
      try {
        const res = await fetch(`/api/projects/${task.project.id}/tasks`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: task.id, dueDate: dayKey }),
        })
        const body: { success?: boolean; error?: string } = await res.json().catch(() => ({}))
        if (!res.ok || !body.success) throw new Error(body.error || 'Could not set the due date')
        toast.success(`Due ${formatDate(dayKey)}`)
        await reloadTasks()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not set the due date')
      }
    },
    [reloadTasks]
  )

  return (
    <PageContainer>
      <PageHeader dateLine={formatDate(data.todayKey)} title={greeting} subtitle={summary} />
      <div className="grid gap-4 md:grid-cols-3">
        <OutTodayCard overview={data.overview} teamUpcoming={data.teamUpcoming} viewerId={viewerId} />
        <TimeOffCard balance={data.balance} ownLeave={data.ownLeave} todayKey={data.todayKey} />
        <HolidayCard overview={data.overview} />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <NeedsYouList data={data.needsYou} todayKey={data.todayKey} done={extras.done} />
        <MyWorkPanel
          tasks={data.tasks}
          projects={data.projects}
          viewerId={viewerId}
          todayKey={data.todayKey}
          onOpenTask={setOpenTask}
          onSetDue={setDue}
          updates={extras.updates}
        />
      </div>
      <HomeTaskSheet
        task={openTask}
        viewer={{ id: viewerId, role: user?.role ?? '' }}
        onClose={closeTask}
        onChanged={onChanged}
      />
    </PageContainer>
  )
}
