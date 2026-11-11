import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  fetchSource,
  needsYouFromSources,
  NOT_LOADED,
  HOME_SOURCES,
  type NeedsYouSources,
} from '@/components/home/fetch-source'
import { pickOpenTasks, type HomeTask } from '@/lib/home/my-work'

const reply = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error
  console.error = () => {}
  try {
    return await fn()
  } finally {
    console.error = original
  }
}

describe('fetchSource', () => {
  it('ok, http error, network error, bad body', async () => {
    assert.deepEqual(await fetchSource('/x', (b) => (b as { v: number }).v, reply({ v: 1 })), { ok: true, data: 1 })
    assert.deepEqual(await quiet(() => fetchSource('/x', () => 1, reply({}, 500))), { ok: false, status: 500 })
    const boom = (async () => {
      throw new Error('net')
    }) as unknown as typeof fetch
    assert.deepEqual(await quiet(() => fetchSource('/x', () => 1, boom)), { ok: false, status: null })
    assert.deepEqual(await quiet(() => fetchSource('/x', () => null, reply({}))), { ok: false, status: null })
  })

  it('does not log a 404', async () => {
    const calls: unknown[] = []
    const original = console.error
    console.error = (...a: unknown[]) => {
      calls.push(a)
    }
    try {
      await fetchSource('/x', () => 1, reply({}, 404))
    } finally {
      console.error = original
    }
    assert.equal(calls.length, 0)
  })
})

const none: NeedsYouSources = {
  card: NOT_LOADED,
  lateForms: NOT_LOADED,
  academy: NOT_LOADED,
  teamLeadForms: NOT_LOADED,
  leaveApprovals: NOT_LOADED,
  wfhApprovals: NOT_LOADED,
  ownLeave: NOT_LOADED,
  securityTasks: NOT_LOADED,
  tickets: NOT_LOADED,
}

const card = {
  ok: true,
  data: { state: 'THIS_WEEK', href: '/weekly', dueAt: null, counts: null, detail: null, selfReview: null, notices: [] },
} as unknown as NeedsYouSources['card']

describe('needsYouFromSources', () => {
  const viewer = { role: 'EMPLOYEE', department: null }

  it('a failing source marks Needs you incomplete; a 404 does not', () => {
    const failed = needsYouFromSources({ ...none, card, leaveApprovals: { ok: false, status: 500 } }, viewer, '2026-11-11')
    assert.equal(failed.items.length, 1)
    assert.equal(failed.incomplete, true)
    const notApplicable = needsYouFromSources({ ...none, card, leaveApprovals: { ok: false, status: 404 } }, viewer, '2026-11-11')
    assert.equal(notApplicable.items.length, 1)
    assert.equal(notApplicable.incomplete, false)
  })

  it('team-lead forms link to the new hire id', () => {
    const result = needsYouFromSources(
      {
        ...none,
        teamLeadForms: {
          ok: true,
          data: [{ id: 'hire-1', name: 'Sana Rauf', title: 'Developer', department: null, onboardingDate: '2026-11-20T00:00:00.000Z' }],
        },
      },
      viewer,
      '2026-11-11'
    )
    assert.equal(result.items[0].href, '/team-lead-form/hire-1')
  })
})

describe('HOME_SOURCES', () => {
  it('uses the exact endpoints and bodies', () => {
    assert.equal(HOME_SOURCES.leaveApprovals.url, '/api/leave/requests?forApproval=true')
    assert.equal(HOME_SOURCES.tasks.url, '/api/my-tasks?status=ACTIVE&sort=due_asc')
    assert.deepEqual(HOME_SOURCES.teamLeadForms.pick({ pending: [{ id: 'h' }] }), [{ id: 'h' }])
    assert.equal(HOME_SOURCES.overview.pick({ data: null }), null)
  })

  it('never asks for device tickets for an employee', () => {
    const src = readFileSync('components/home/use-home-data.ts', 'utf8')
    assert.match(src, /role === 'HR' \|\| role === 'SECURITY'[\s\S]*?\.tickets\.url/)
  })
})

describe('open tasks', () => {
  const task = (id: string, dueDate: string | null): HomeTask => ({
    id,
    title: id,
    status: 'TODO',
    priority: 'MEDIUM',
    dueDate,
    project: { id: 'p', name: 'P' },
  })

  it('top 4 by due date, undated last, regardless of arrival order', () => {
    const picked = pickOpenTasks([
      task('u', null),
      task('e', '2026-12-05'),
      task('b', '2026-11-12'),
      task('d', '2026-12-01'),
      task('a', '2026-11-11'),
      task('c', '2026-11-20'),
    ])
    assert.deepEqual(picked.shown.map((x) => x.id), ['a', 'b', 'c', 'd'])
    assert.equal(picked.more, 2)
  })
})
