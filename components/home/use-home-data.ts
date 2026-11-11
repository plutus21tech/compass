'use client'

import { useCallback, useEffect, useState } from 'react'
import { karachiDayKey } from '@/lib/home/time'
import type { HomeOverview, TeamUpcomingRow } from '@/lib/home/out-today'
import type { BalanceInput } from '@/lib/home/time-off'
import type { HomeProject, HomeTask } from '@/lib/home/my-work'
import type { NeedsYouItem } from '@/lib/home/needs-you'
import type { OwnLeaveRow } from '@/lib/home/needs-you-sources'
import {
  fetchSource,
  needsYouFromSources,
  HOME_SOURCES,
  NOT_LOADED,
  type NeedsYouSources,
  type Source,
} from './fetch-source'

export interface HomeData {
  loading: boolean
  todayKey: string
  overview: Source<HomeOverview> | null
  balance: Source<BalanceInput> | null
  ownLeave: Source<OwnLeaveRow[]> | null
  teamUpcoming: Source<TeamUpcomingRow[]> | null
  needsYou: { items: NeedsYouItem[]; incomplete: boolean } | null
  tasks: Source<HomeTask[]> | null
  projects: Source<HomeProject[]> | null
  reloadTasks(): Promise<void>
}

interface HomeUser {
  id: string
  role: string
  department?: string | null
}

type Loaded = Omit<HomeData, 'loading' | 'todayKey' | 'reloadTasks'>

const EMPTY: Loaded = {
  overview: null,
  balance: null,
  ownLeave: null,
  teamUpcoming: null,
  needsYou: null,
  tasks: null,
  projects: null,
}

const S = HOME_SOURCES

async function loadTickets(role: string): Promise<NeedsYouSources['tickets']> {
  if (role === 'HR' || role === 'SECURITY') return fetchSource(S.tickets.url, S.tickets.pick)
  return NOT_LOADED
}

async function loadSecurityTasks(): Promise<NeedsYouSources['securityTasks']> {
  const me = await fetchSource(S.securityMe.url, S.securityMe.pick)
  if (!me.ok) return me
  if (!me.data.enabled || !(me.data.actionable && me.data.actionable > 0)) return NOT_LOADED
  return fetchSource(S.securityTasks.url, S.securityTasks.pick)
}

async function loadCard(): Promise<NeedsYouSources['card']> {
  const res = await fetchSource(S.card.url, S.card.pick)
  return res.ok ? { ok: true, data: res.data.card } : res
}

export async function loadAll(user: HomeUser, todayKey: string): Promise<Loaded> {
  const [
    card, lateForms, academy, teamLeadForms, leaveApprovals, wfhApprovals, ownLeave, securityTasks, tickets,
    overview, balance, teamUpcoming, tasks, projects,
  ] = await Promise.all([
    loadCard(),
    fetchSource(S.lateForms.url, S.lateForms.pick),
    fetchSource(S.academy.url, S.academy.pick),
    fetchSource(S.teamLeadForms.url, S.teamLeadForms.pick),
    fetchSource(S.leaveApprovals.url, S.leaveApprovals.pick),
    fetchSource(S.wfhApprovals.url, S.wfhApprovals.pick),
    fetchSource(S.ownLeave.url, S.ownLeave.pick),
    loadSecurityTasks(),
    loadTickets(user.role),
    fetchSource(S.overview.url, S.overview.pick),
    fetchSource(S.balance.url, S.balance.pick),
    fetchSource(S.teamUpcoming.url, S.teamUpcoming.pick),
    fetchSource(S.tasks.url, S.tasks.pick),
    fetchSource(S.projects.url, S.projects.pick),
  ])
  const needsYou = needsYouFromSources(
    { card, lateForms, academy, teamLeadForms, leaveApprovals, wfhApprovals, ownLeave, securityTasks, tickets },
    { role: user.role, department: user.department ?? null },
    todayKey
  )
  return { overview, balance, ownLeave, teamUpcoming, needsYou, tasks, projects }
}

export function useHomeData(user: HomeUser | null): HomeData {
  const [todayKey] = useState(() => karachiDayKey(new Date()))
  const [loaded, setLoaded] = useState<Loaded>(EMPTY)
  const [loading, setLoading] = useState(true)
  const userId = user?.id ?? null
  const role = user?.role ?? null
  const department = user?.department ?? null

  useEffect(() => {
    if (userId === null || role === null) return
    let cancelled = false
    loadAll({ id: userId, role, department }, todayKey)
      .then((next) => {
        if (!cancelled) setLoaded(next)
      })
      .catch((error: unknown) => {
        console.error('[home] load failed', error)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId, role, department, todayKey])

  const reloadTasks = useCallback(async () => {
    const tasks = await fetchSource(S.tasks.url, S.tasks.pick)
    setLoaded((prev) => ({ ...prev, tasks }))
  }, [])

  return { loading, todayKey, ...loaded, reloadTasks }
}
