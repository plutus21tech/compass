import test from 'node:test'
import assert from 'node:assert/strict'
import { withReloadedTasks } from '../components/home/use-home-data'
import type { HomeTask } from '../lib/home/my-work'

const good = { ok: true as const, data: [{ id: 't1' } as unknown as HomeTask] }
const base = { overview: null, balance: null, ownLeave: null, teamUpcoming: null, needsYou: null, projects: null }

test('a failed task reload keeps the tasks already shown', () => {
  const prev = { ...base, tasks: good }
  assert.equal(withReloadedTasks(prev, { ok: false, status: 500 }), prev)
})

test('a successful reload replaces the tasks without touching the rest', () => {
  const prev = { ...base, tasks: good }
  const fresh = { ok: true as const, data: [] as HomeTask[] }
  const next = withReloadedTasks(prev, fresh)
  assert.equal(next.tasks, fresh)
  assert.notEqual(next, prev)
  assert.equal(prev.tasks, good)
})

test('a failed reload after a failed load still reports the failure', () => {
  const prev = { ...base, tasks: { ok: false as const, status: null } }
  const failed = { ok: false as const, status: 500 }
  assert.equal(withReloadedTasks(prev, failed).tasks, failed)
})
