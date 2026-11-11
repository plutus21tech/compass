import { formatCountOf } from '@/lib/format-count'
import type { Label, PanelSprint, PanelTask, ProjectStatusSection } from '@/components/projects/TaskDetailPanel'

export const OPEN_TASKS_SHOWN = 4
export const PROJECTS_SHOWN = 3

export interface HomeTask {
  id: string
  title: string
  status: string
  priority: string
  dueDate: string | null
  project: { id: string; name: string }
  section?: { name: string } | null
}

export function pickOpenTasks(tasks: readonly HomeTask[]): { shown: HomeTask[]; more: number } {
  const open = tasks.filter((t) => t.status !== 'DONE')
  const dated = open.filter((t) => t.dueDate).sort((a, b) => Date.parse(a.dueDate as string) - Date.parse(b.dueDate as string))
  const ordered = [...dated, ...open.filter((t) => !t.dueDate)]
  return { shown: ordered.slice(0, OPEN_TASKS_SHOWN), more: Math.max(0, ordered.length - OPEN_TASKS_SHOWN) }
}

export interface HomeProject {
  id: string
  name: string
  status: string
  owner: { id: string }
  members: { id: string }[]
  progress: { completed: number; total: number; percentage: number | null }
}

/** Active projects the viewer owns or is a member of (HR's view of everything is not "your projects"). */
export function pickActiveProjects(
  projects: readonly HomeProject[],
  viewerId: string
): { shown: HomeProject[]; more: number } {
  const mine = projects.filter(
    (p) => p.status === 'ACTIVE' && (p.owner.id === viewerId || p.members.some((m) => m.id === viewerId))
  )
  return { shown: mine.slice(0, PROJECTS_SHOWN), more: Math.max(0, mine.length - PROJECTS_SHOWN) }
}

export function projectProgressPhrase(p: HomeProject['progress']): string {
  return p.total === 0 ? 'No tasks yet' : `${formatCountOf(p.completed, p.total)} tasks done`
}

export interface PanelContext {
  members: { id: string; name: string; role: string }[]
  sections: ProjectStatusSection[]
  labels: Label[]
  sprints: PanelSprint[]
  canManage: boolean
  canEditTask(task: PanelTask): boolean
}

/** The minimal shape of GET /api/projects/{id}'s `project` that the panel rules read. */
export interface ProjectDetail {
  owner: { id: string }
  members: { role: string; user: { id: string; name: string } }[]
  canManage?: boolean
  canUseBacklog?: boolean
  sections: ProjectStatusSection[]
  labels: Label[]
  sprints?: PanelSprint[]
  tasks: PanelTask[]
}

/** Mirrors app/(evaluator)/projects/[id]/page.tsx so the side sheet grants the same permissions. */
export function panelContextFromProject(project: ProjectDetail, viewer: { id: string; role: string }): PanelContext {
  const members = project.members.map((m) => ({ ...m.user, role: m.role }))
  const canManage =
    project.canManage ??
    (viewer.role === 'HR' ||
      project.owner.id === viewer.id ||
      members.some((m) => m.id === viewer.id && ['OWNER', 'LEAD'].includes(m.role)))
  const sections =
    project.canUseBacklog === false ? project.sections.filter((s) => !s.isBacklog) : project.sections
  return {
    members,
    sections,
    labels: project.labels,
    sprints: project.sprints ?? [],
    canManage,
    canEditTask: (task) =>
      canManage ||
      task.assigneeId === viewer.id ||
      Boolean(task.assistants?.some((a) => a.user.id === viewer.id)),
  }
}
