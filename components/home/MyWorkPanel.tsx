'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, formatTimestampDate } from '@/lib/format-date'
import { nextFridayKey, type TaskUpdate } from '@/lib/home/extras'
import {
  overdueByProject,
  pickActiveProjects,
  pickOpenTasks,
  projectProgressPhrase,
  type HomeProject,
  type HomeTask,
} from '@/lib/home/my-work'
import type { Source } from './fetch-source'

interface MyWorkPanelProps {
  tasks: Source<HomeTask[]> | null
  projects: Source<HomeProject[]> | null
  viewerId: string
  /** Today's day key; with it, projects show how many of your tasks are overdue. */
  todayKey?: string
  onOpenTask(task: HomeTask): void
  /** Gives a task with no due date one in a click. */
  onSetDue?(task: HomeTask, dayKey: string): void
  /** Changes other people made to your open tasks; null while loading, absent when not shown. */
  updates?: { shown: TaskUpdate[]; more: number } | null
}

function UpdatesSection({ updates }: { updates: { shown: TaskUpdate[]; more: number } | null }) {
  if (updates === null) return <Loading />
  if (updates.shown.length === 0) return <p className="text-sm text-muted-foreground">No updates this month.</p>
  return (
    <ul className="space-y-2">
      {updates.shown.map((update) => (
        <li key={update.id} className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 text-foreground">{update.summary}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatTimestampDate(update.createdAt)}</span>
        </li>
      ))}
    </ul>
  )
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase()
}

function Eyebrow({ children }: { children: string }) {
  return <h3 className="text-xs font-medium text-muted-foreground">{children}</h3>
}

function Loading() {
  return (
    <div role="status" aria-label="Loading" className="space-y-2">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  )
}

function Unavailable() {
  return <p className="text-sm text-muted-foreground">Could not load this. Refresh to try again.</p>
}

interface TaskRowProps {
  task: HomeTask
  onOpenTask(task: HomeTask): void
  /** The day a one-click "Set" would give a task with no due date; absent when that is not offered. */
  suggestedDue?: string
  onSetDue?(task: HomeTask, dayKey: string): void
}

function TaskRow({ task, onOpenTask, suggestedDue, onSetDue }: TaskRowProps) {
  const canSet = !task.dueDate && suggestedDue !== undefined && onSetDue !== undefined
  return (
    <li className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onOpenTask(task)}
        className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <span className="block font-medium text-foreground">{task.title}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
          <span>{task.project.name}</span>
          <span>{titleCase(task.priority)}</span>
          {task.section?.name ? <span>{task.section.name}</span> : null}
          {task.dueDate ? (
            <span>Due {formatDate(task.dueDate)}</span>
          ) : (
            <span className="text-amber-700 dark:text-amber-300">No due date</span>
          )}
        </span>
      </button>
      {canSet ? (
        <button
          type="button"
          onClick={() => onSetDue(task, suggestedDue)}
          aria-label={`Set ${task.title} due ${formatDate(suggestedDue)}`}
          className="shrink-0 rounded-md border border-border px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          Set {formatDate(suggestedDue)}
        </button>
      ) : null}
    </li>
  )
}

function TasksSection({ tasks, onOpenTask, todayKey, onSetDue }: Pick<MyWorkPanelProps, 'tasks' | 'onOpenTask' | 'todayKey' | 'onSetDue'>) {
  if (tasks === null) return <Loading />
  if (!tasks.ok) return <Unavailable />
  const { shown } = pickOpenTasks(tasks.data)
  if (shown.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">No open tasks.</span> Tasks assigned to you in Projects show up here.{' '}
        <Link href="/projects" className="text-primary hover:underline">
          Open Projects
        </Link>
      </p>
    )
  }
  return (
    <ul className="-mx-2 space-y-1">
      {shown.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          onOpenTask={onOpenTask}
          suggestedDue={todayKey ? nextFridayKey(todayKey) : undefined}
          onSetDue={onSetDue}
        />
      ))}
    </ul>
  )
}

function ProjectRow({ project, overdue }: { project: HomeProject; overdue: number }) {
  const pct = project.progress.percentage ?? 0
  return (
    <li>
      <Link href={`/projects/${project.id}`} className="block rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-medium text-foreground">{project.name}</span>
          <span className="text-sm text-muted-foreground">{project.progress.percentage === null ? '' : `${pct}%`}</span>
        </span>
        <span className="block text-sm text-muted-foreground">
          {projectProgressPhrase(project.progress)}
          {overdue > 0 ? <span className="font-medium text-red-600 dark:text-red-400"> · {overdue} overdue</span> : null}
        </span>
        <Progress value={pct} aria-label={`${project.name} progress`} className="mt-2 h-1.5" />
      </Link>
    </li>
  )
}

function ProjectsSection({ projects, viewerId, tasks, todayKey }: Pick<MyWorkPanelProps, 'projects' | 'viewerId' | 'tasks' | 'todayKey'>) {
  if (projects === null) return <Loading />
  if (!projects.ok) return <Unavailable />
  const { shown, more } = pickActiveProjects(projects.data, viewerId)
  const overdue = tasks?.ok && todayKey ? overdueByProject(tasks.data, todayKey) : new Map<string, number>()
  if (shown.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">You&apos;re not on a project yet.</span> Ask your lead to add you.
      </p>
    )
  }
  return (
    <>
      <ul className="-mx-2 space-y-1">
        {shown.map((project) => (
          <ProjectRow key={project.id} project={project} overdue={overdue.get(project.id) ?? 0} />
        ))}
      </ul>
      {more > 0 ? (
        <Link href="/projects" className="mt-2 inline-block text-sm text-primary hover:underline">
          and {more} more
        </Link>
      ) : null}
    </>
  )
}

export function MyWorkPanel({ tasks, projects, viewerId, todayKey, onOpenTask, onSetDue, updates }: MyWorkPanelProps) {
  return (
    <section aria-labelledby="my-work-heading" className="flex flex-col">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="my-work-heading" className="text-base font-semibold text-foreground">
          My work
        </h2>
        <Link href="/my-tasks" className="text-sm text-primary hover:underline">
          Open My work
        </Link>
      </div>
      {/* Fills the row so its bottom edge lines up with Needs you. */}
      <Card className="flex flex-1 flex-col divide-y divide-border">
        <div className="space-y-3 p-5">
          <Eyebrow>Your open tasks</Eyebrow>
          <TasksSection tasks={tasks} onOpenTask={onOpenTask} todayKey={todayKey} onSetDue={onSetDue} />
        </div>
        <div className="flex-1 space-y-3 p-5">
          <Eyebrow>Your projects</Eyebrow>
          <ProjectsSection projects={projects} viewerId={viewerId} tasks={tasks} todayKey={todayKey} />
        </div>
        {updates !== undefined ? (
          <div className="space-y-3 p-5">
            <Eyebrow>Recent updates</Eyebrow>
            <UpdatesSection updates={updates} />
          </div>
        ) : null}
        {updates && updates.more > 0 ? (
          <div className="flex items-center justify-between gap-3 bg-muted/40 px-5 py-3 text-sm text-muted-foreground">
            <span>{updates.more} more {updates.more === 1 ? 'update' : 'updates'}</span>
            <Link href="/my-tasks" className="text-primary hover:underline">See all</Link>
          </div>
        ) : null}
      </Card>
    </section>
  )
}
