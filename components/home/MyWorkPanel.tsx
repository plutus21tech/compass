'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/format-date'
import {
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
  onOpenTask(task: HomeTask): void
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

function TaskRow({ task, onOpenTask }: { task: HomeTask; onOpenTask(task: HomeTask): void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpenTask(task)}
        className="w-full rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <span className="block font-medium text-foreground">{task.title}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-muted-foreground">
          <span>{task.project.name}</span>
          <span>{titleCase(task.priority)}</span>
          {task.section?.name ? <span>{task.section.name}</span> : null}
          <span>{task.dueDate ? `Due ${formatDate(task.dueDate)}` : 'No due date'}</span>
        </span>
      </button>
    </li>
  )
}

function TasksSection({ tasks, onOpenTask }: Pick<MyWorkPanelProps, 'tasks' | 'onOpenTask'>) {
  if (tasks === null) return <Loading />
  if (!tasks.ok) return <Unavailable />
  const { shown } = pickOpenTasks(tasks.data)
  if (shown.length === 0) return <p className="text-sm text-muted-foreground">No open tasks. Nice.</p>
  return (
    <ul className="-mx-2 space-y-1">
      {shown.map((task) => (
        <TaskRow key={task.id} task={task} onOpenTask={onOpenTask} />
      ))}
    </ul>
  )
}

function ProjectRow({ project }: { project: HomeProject }) {
  const pct = project.progress.percentage ?? 0
  return (
    <li>
      <Link href={`/projects/${project.id}`} className="block rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-medium text-foreground">{project.name}</span>
          <span className="text-sm text-muted-foreground">{project.progress.percentage === null ? '' : `${pct}%`}</span>
        </span>
        <span className="block text-sm text-muted-foreground">{projectProgressPhrase(project.progress)}</span>
        <Progress value={pct} aria-label={`${project.name} progress`} className="mt-2 h-1.5" />
      </Link>
    </li>
  )
}

function ProjectsSection({ projects, viewerId }: Pick<MyWorkPanelProps, 'projects' | 'viewerId'>) {
  if (projects === null) return <Loading />
  if (!projects.ok) return <Unavailable />
  const { shown, more } = pickActiveProjects(projects.data, viewerId)
  if (shown.length === 0) return <p className="text-sm text-muted-foreground">You have no active projects.</p>
  return (
    <>
      <ul className="-mx-2 space-y-1">
        {shown.map((project) => (
          <ProjectRow key={project.id} project={project} />
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

export function MyWorkPanel({ tasks, projects, viewerId, onOpenTask }: MyWorkPanelProps) {
  return (
    <section aria-labelledby="my-work-heading">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="my-work-heading" className="text-base font-semibold text-foreground">
          My work
        </h2>
        <Link href="/my-tasks" className="text-sm text-primary hover:underline">
          Open My work
        </Link>
      </div>
      <Card className="divide-y divide-border">
        <div className="space-y-3 p-5">
          <Eyebrow>Your open tasks</Eyebrow>
          <TasksSection tasks={tasks} onOpenTask={onOpenTask} />
        </div>
        <div className="space-y-3 p-5">
          <Eyebrow>Your projects</Eyebrow>
          <ProjectsSection projects={projects} viewerId={viewerId} />
        </div>
      </Card>
    </section>
  )
}
