import test, { afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  cancelLeave, cancelWfh, decideLeave, decideWfh, loadCalendarMonth, loadTimeOff, readResult,
  reviewTransitionPlan, saveTransitionPlanDraft, submitLeave, submitTransitionPlan, submitWfh, updateLeave,
} from '../lib/time-off/api'

const realFetch = globalThis.fetch
let calls: Array<[string, RequestInit | undefined]> = []

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function stub(handler: (url: string, init?: RequestInit) => Response) {
  calls = []
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push([String(url), init])
    return handler(String(url), init)
  }) as typeof fetch
}

afterEach(() => { globalThis.fetch = realFetch })

test('submitLeave posts the payload and returns the new id', async () => {
  stub(() => json({ success: true, request: { id: 'lr1' } }))
  const r = await submitLeave({ leaveType: 'ANNUAL' })
  assert.deepEqual(r, { ok: true, data: { success: true, request: { id: 'lr1' } } })
  assert.equal(calls[0][0], '/api/leave/requests')
  assert.equal(calls[0][1]?.method, 'POST')
})

test('server errors pass through; network errors use the fallback', async () => {
  const msg = 'Insufficient annual leave balance. Available: 2 days, Requested: 3 days'
  stub(() => json({ error: msg }, 400))
  assert.deepEqual(await submitLeave({}), { ok: false, error: msg })
  stub(() => { throw new TypeError('fetch failed') })
  assert.deepEqual(await cancelLeave('x'), { ok: false, error: 'Failed to cancel' })
})

test('readResult: success false fails; non-JSON uses the fallback', async () => {
  assert.deepEqual(await readResult(json({ success: false, error: 'No' }), 'fb'), { ok: false, error: 'No' })
  assert.deepEqual(await readResult(json({ success: false }), 'fb'), { ok: false, error: 'fb' })
  assert.deepEqual(await readResult(new Response('<html>', { status: 502 }), 'fb'), { ok: false, error: 'fb' })
  assert.deepEqual(await readResult(json({}, 500), 'fb'), { ok: false, error: 'fb' })
})

test('every endpoint keeps its URL, method and body', async () => {
  const tasks = [{ id: 't' }] as never
  const table: Array<[() => Promise<unknown>, string, string, unknown]> = [
    [() => submitLeave({ a: 1 }), '/api/leave/requests', 'POST', { a: 1 }],
    [() => updateLeave({ id: 'x' }), '/api/leave/requests', 'PUT', { id: 'x' }],
    [() => cancelLeave('a b'), '/api/leave/requests?id=a%20b', 'DELETE', undefined],
    [() => decideLeave('r1', 'approve'), '/api/leave/approve', 'POST', { requestId: 'r1', action: 'approve' }],
    [() => saveTransitionPlanDraft('r1', tasks), '/api/leave/requests/r1/transition-plan', 'PUT', { tasks }],
    [() => submitTransitionPlan('r1', tasks), '/api/leave/requests/r1/transition-plan', 'POST', { tasks }],
    [() => reviewTransitionPlan('r1', 'DISAPPROVE', 'why'), '/api/leave/requests/r1/transition-plan/review', 'POST', { action: 'DISAPPROVE', reason: 'why' }],
    [() => submitWfh({ startDate: '2026-01-01', endDate: '2026-01-02', requestTimezone: 'UTC', reason: 'r', workPlan: '' }), '/api/wfh/requests', 'POST', { startDate: '2026-01-01', endDate: '2026-01-02', requestTimezone: 'UTC', reason: 'r' }],
    [() => cancelWfh('w1'), '/api/wfh/requests?id=w1', 'DELETE', undefined],
    [() => decideWfh('w1', 'reject'), '/api/wfh/approve', 'POST', { requestId: 'w1', action: 'reject' }],
  ]
  for (const [fn, url, method, body] of table) {
    stub(() => json({ success: true }))
    const r = await fn()
    assert.deepEqual(r, { ok: true, data: { success: true } }, url)
    assert.equal(calls[0][0], url)
    assert.equal(calls[0][1]?.method, method)
    if (body !== undefined) {
      assert.equal((calls[0][1]?.headers as Record<string, string>)['Content-Type'], 'application/json')
      assert.deepEqual(JSON.parse(String(calls[0][1]?.body)), body)
    } else {
      assert.equal(calls[0][1]?.body, undefined)
    }
  }
})

test('loadCalendarMonth calls the calendar endpoint', async () => {
  stub(() => json({ events: [{ id: 'e' }], holidays: [], birthdays: [] }))
  const r = await loadCalendarMonth(2026, 10)
  assert.equal(calls[0][0], '/api/leave/calendar?month=10&year=2026')
  assert.deepEqual(r, { ok: true, data: { events: [{ id: 'e' }], holidays: [], birthdays: [] } })
})

const route = (overrides: Record<string, () => Response> = {}) => (url: string) => {
  const override = overrides[url]
  if (override) return override()
  if (url === '/api/leave/balance') return json({ balance: { casualDays: 1 } })
  if (url === '/api/leave/requests?employeeId=me') return json({ requests: [{ id: 'own' }] })
  if (url === '/api/users') return json({ users: [{ id: 'u' }] })
  if (url === '/api/leave/requests?forApproval=true') return json({ requests: [{ id: 'ap' }] })
  if (url === '/api/wfh/requests?employeeId=me') return json({ requests: [{ id: 'w' }] })
  if (url === '/api/wfh/requests?forApproval=true') return json({ requests: [{ id: 'wa' }] })
  return json({}, 404)
}

test('loadTimeOff reads all six lists', async () => {
  stub(route())
  const r = await loadTimeOff()
  assert.ok(r.ok)
  if (r.ok) {
    assert.deepEqual(r.data.requests, [{ id: 'own' }])
    assert.deepEqual(r.data.approvals, [{ id: 'ap' }])
    assert.deepEqual(r.data.wfhRequests, [{ id: 'w' }])
    assert.deepEqual(r.data.wfhApprovals, [{ id: 'wa' }])
    assert.deepEqual(r.data.users, [{ id: 'u' }])
    assert.deepEqual(r.data.balance, { casualDays: 1 })
  }
  assert.equal(calls.length, 6)
})

test('loadTimeOff tolerates failing approvals and WFH calls', async () => {
  stub(route({
    '/api/leave/requests?forApproval=true': () => json({ error: 'x' }, 500),
    '/api/wfh/requests?employeeId=me': () => { throw new TypeError('down') },
    '/api/wfh/requests?forApproval=true': () => json({ error: 'x' }, 500),
  }))
  const r = await loadTimeOff()
  assert.ok(r.ok)
  if (r.ok) {
    assert.deepEqual(r.data.approvals, [])
    assert.deepEqual(r.data.wfhRequests, [])
    assert.deepEqual(r.data.wfhApprovals, [])
    assert.deepEqual(r.data.requests, [{ id: 'own' }])
  }
})

test('loadTimeOff fails when balance or own requests fail', async () => {
  const msg = 'Could not load your time off. Refresh to try again.'
  stub(route({ '/api/leave/balance': () => json({ error: 'x' }, 500) }))
  assert.deepEqual(await loadTimeOff(), { ok: false, error: msg })
  stub(route({ '/api/leave/requests?employeeId=me': () => { throw new TypeError('down') } }))
  assert.deepEqual(await loadTimeOff(), { ok: false, error: msg })
})
