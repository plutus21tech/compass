import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  OPEN_TASKS_SHOWN, PROJECTS_SHOWN, panelContextFromProject, pickActiveProjects, pickOpenTasks,
  projectProgressPhrase, type HomeProject, type HomeTask, type ProjectDetail,
} from '../lib/home/my-work'

const task = (id: string, over: Partial<HomeTask> = {}): HomeTask => ({
  id, title: id, status: 'TODO', priority: 'MEDIUM', dueDate: '2026-11-20T00:00:00.000Z',
  project: { id: 'p', name: 'P' }, ...over,
})

const project = (id: string, over: Partial<HomeProject> = {}): HomeProject => ({
  id, name: id, status: 'ACTIVE', owner: { id: 'boss' }, members: [{ id: 'me' }],
  progress: { completed: 1, total: 2, percentage: 50 }, ...over,
})

describe('my work', () => {
  it('open tasks: four, dated first', () => {
    const tasks = [
      task('u1', { dueDate: null }), task('d1'), task('done', { status: 'DONE' }), task('d2'), task('d3'), task('d4'), task('d5'),
    ]
    const { shown, more } = pickOpenTasks(tasks)
    assert.equal(OPEN_TASKS_SHOWN, 4)
    assert.deepEqual(shown.map((t) => t.id), ['d1', 'd2', 'd3', 'd4'])
    assert.equal(more, 2)
    assert.deepEqual(pickOpenTasks([task('u', { dueDate: null }), task('d')]).shown.map((t) => t.id), ['d', 'u'])
  })

  it('projects: active ones you belong to, three at most', () => {
    const list = [
      project('a'), project('hr-only', { members: [], owner: { id: 'x' } }), project('done', { status: 'COMPLETED' }),
      project('owned', { owner: { id: 'me' }, members: [] }), project('b'), project('c'),
    ]
    const { shown, more } = pickActiveProjects(list, 'me')
    assert.equal(PROJECTS_SHOWN, 3)
    assert.deepEqual(shown.map((p) => p.id), ['a', 'owned', 'b'])
    assert.equal(more, 1)
  })

  it('progress phrase', () => {
    assert.equal(projectProgressPhrase({ completed: 86, total: 108, percentage: 80 }), '86 of 108 tasks done')
    assert.equal(projectProgressPhrase({ completed: 0, total: 0, percentage: null }), 'No tasks yet')
  })
})

const detail = (over: Partial<ProjectDetail> = {}): ProjectDetail => ({
  owner: { id: 'boss' },
  members: [
    { role: 'LEAD', user: { id: 'lead', name: 'Lead' } },
    { role: 'MEMBER', user: { id: 'me', name: 'Me' } },
  ],
  sections: [
    { id: 's1', name: 'To do', color: '#000', canonicalStatus: 'TODO', isDefault: true, isDone: false },
    { id: 's2', name: 'Backlog', color: '#000', canonicalStatus: 'TODO', isDefault: false, isDone: false, isBacklog: true },
  ],
  labels: [], tasks: [], ...over,
})

const panelTask = (over: Record<string, unknown>) => ({ id: 't', assigneeId: null, assistants: [], ...over }) as never

describe('panel context follows the project page rules', () => {
  it('lead member can manage and edit anything', () => {
    const ctx = panelContextFromProject(detail(), { id: 'lead', role: 'EMPLOYEE' })
    assert.equal(ctx.canManage, true)
    assert.equal(ctx.canEditTask(panelTask({})), true)
    assert.deepEqual(ctx.members[0], { id: 'lead', name: 'Lead', role: 'LEAD' })
  })

  it('HR, owner and an explicit canManage flag manage', () => {
    assert.equal(panelContextFromProject(detail(), { id: 'x', role: 'HR' }).canManage, true)
    assert.equal(panelContextFromProject(detail(), { id: 'boss', role: 'EMPLOYEE' }).canManage, true)
    assert.equal(panelContextFromProject(detail({ canManage: false }), { id: 'x', role: 'HR' }).canManage, false)
  })

  it('plain member edits only assigned or assisted tasks', () => {
    const ctx = panelContextFromProject(detail(), { id: 'me', role: 'EMPLOYEE' })
    assert.equal(ctx.canManage, false)
    assert.equal(ctx.canEditTask(panelTask({})), false)
    assert.equal(ctx.canEditTask(panelTask({ assigneeId: 'me' })), true)
    assert.equal(ctx.canEditTask(panelTask({ assistants: [{ id: 'a', user: { id: 'me', name: 'Me' } }] })), true)
  })

  it('a non-member, non-manager is read-only', () => {
    const ctx = panelContextFromProject(detail(), { id: 'stranger', role: 'EMPLOYEE' })
    assert.equal(ctx.canManage, false)
    assert.equal(ctx.canEditTask(panelTask({})), false)
  })

  it('backlog sections hidden when canUseBacklog is false', () => {
    const hidden = panelContextFromProject(detail({ canUseBacklog: false }), { id: 'me', role: 'EMPLOYEE' })
    assert.deepEqual(hidden.sections.map((s) => s.id), ['s1'])
    assert.equal(panelContextFromProject(detail(), { id: 'me', role: 'EMPLOYEE' }).sections.length, 2)
    assert.deepEqual(panelContextFromProject(detail(), { id: 'me', role: 'EMPLOYEE' }).sprints, [])
  })
})
