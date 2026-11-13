'use client'

import { useCallback, useEffect, useState } from 'react'
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

  return (
    <PageContainer>
      <PageHeader dateLine={formatDate(data.todayKey)} title={greeting} subtitle={summary} />
      <div className="grid gap-4 md:grid-cols-3">
        <OutTodayCard overview={data.overview} teamUpcoming={data.teamUpcoming} viewerId={viewerId} />
        <TimeOffCard balance={data.balance} ownLeave={data.ownLeave} todayKey={data.todayKey} />
        <HolidayCard overview={data.overview} />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <NeedsYouList data={data.needsYou} todayKey={data.todayKey} />
        <MyWorkPanel tasks={data.tasks} projects={data.projects} viewerId={viewerId} onOpenTask={setOpenTask} />
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
