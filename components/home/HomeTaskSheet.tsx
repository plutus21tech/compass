'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { TaskDetailPanel, type PanelTask } from '@/components/projects/TaskDetailPanel'
import { panelContextFromProject, type HomeTask, type ProjectDetail } from '@/lib/home/my-work'

interface HomeTaskSheetProps {
  task: HomeTask | null
  viewer: { id: string; role: string }
  onClose(): void
  onChanged(): Promise<void> | void
}

const LOAD_FAILED = 'Could not open this task. Open it from My work.'

async function fetchProject(projectId: string): Promise<ProjectDetail | null> {
  try {
    const res = await fetch(`/api/projects/${projectId}`, { cache: 'no-store' })
    if (!res.ok) return null
    const body = (await res.json()) as { project?: ProjectDetail }
    return body.project ?? null
  } catch {
    return null
  }
}

export function HomeTaskSheet({ task, viewer, onClose, onChanged }: HomeTaskSheetProps) {
  const cache = useRef(new Map<string, ProjectDetail>())
  const [projectId, setProjectId] = useState<string | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const wantedProject = task?.project.id ?? null
  const wantedTask = task?.id ?? null

  useEffect(() => {
    setProjectId(wantedProject)
    setTaskId(wantedTask)
  }, [wantedProject, wantedTask])

  useEffect(() => {
    if (!wantedProject) return
    let cancelled = false
    const run = async () => {
      const project = cache.current.get(wantedProject) ?? (await fetchProject(wantedProject))
      if (cancelled) return
      if (!project || !project.tasks.some((t) => t.id === wantedTask)) {
        toast.error(LOAD_FAILED)
        onClose()
        return
      }
      cache.current.set(wantedProject, project)
      setVersion((v) => v + 1)
    }
    void run()
    return () => {
      cancelled = true
    }
    // onClose identity changes must not refetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedProject, wantedTask])

  const reload = useCallback(async () => {
    if (!projectId) return
    const project = await fetchProject(projectId)
    if (project) cache.current.set(projectId, project)
    setVersion((v) => v + 1)
    await onChanged()
  }, [projectId, onChanged])

  const project = projectId ? cache.current.get(projectId) ?? null : null
  const panelTask: PanelTask | null = project?.tasks.find((t) => t.id === taskId) ?? null
  const ctx = project ? panelContextFromProject(project, viewer) : null
  void version

  const handleUpdate = (updated: PanelTask) => {
    if (projectId && project) {
      const next = { ...project, tasks: project.tasks.map((t) => (t.id === updated.id ? updated : t)) }
      cache.current.set(projectId, next)
      setVersion((v) => v + 1)
    }
    void onChanged()
  }

  const handleDelete = () => {
    if (projectId) cache.current.delete(projectId)
    onClose()
    void onChanged()
  }

  const handleOpenTask = (id: string) => {
    if (project?.tasks.some((t) => t.id === id)) setTaskId(id)
  }

  if (!task || !projectId || !ctx) return null

  return (
    <TaskDetailPanel
      task={panelTask}
      projectId={projectId}
      members={ctx.members}
      sections={ctx.sections}
      labels={ctx.labels}
      sprints={ctx.sprints}
      open={panelTask !== null}
      onClose={onClose}
      onTaskUpdate={handleUpdate}
      onTaskDelete={handleDelete}
      onTasksChange={reload}
      onOpenTask={handleOpenTask}
      canManage={ctx.canManage}
      canEdit={panelTask ? ctx.canEditTask(panelTask) : false}
    />
  )
}
