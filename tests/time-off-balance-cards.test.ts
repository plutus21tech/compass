import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildBalanceCards, nextLeave } from '@/lib/time-off/balance-cards'
import { BalanceCards } from '@/components/leave/time-off/BalanceCards'
import type { LeaveBalance, LeaveRequest } from '@/lib/time-off/types'

type Overrides = Partial<Record<'casualDays' | 'sickDays' | 'annualDays' | 'casualUsed' | 'sickUsed' | 'annualUsed', number>>

function balance(o: Overrides = {}): LeaveBalance {
  const b = { casualDays: 10, sickDays: 6, annualDays: 14, casualUsed: 0, sickUsed: 0, annualUsed: 0, ...o }
  return {
    ...b,
    remaining: { casual: b.casualDays - b.casualUsed, sick: b.sickDays - b.sickUsed, annual: b.annualDays - b.annualUsed },
  }
}

function req(o: Partial<LeaveRequest>): LeaveRequest {
  return {
    id: 'r',
    leaveType: 'CASUAL',
    isHalfDay: false,
    startDate: '2026-11-19',
    endDate: '2026-11-19',
    reason: 'x',
    transitionPlan: '',
    status: 'PENDING',
    createdAt: '2026-11-01',
    ...o,
  }
}

test('casual 5 left of 10 with nothing pending', () => {
  const [casual] = buildBalanceCards(balance({ casualDays: 10, casualUsed: 5 }), [], 2026)
  assert.deepEqual([casual.left, casual.total, casual.note, casual.fraction], [5, 10, 'Nothing pending', 0.5])
})

test('cards come in casual, sick, annual order', () => {
  assert.deepEqual(buildBalanceCards(balance(), [], 2026).map((c) => c.type), ['CASUAL', 'SICK', 'ANNUAL'])
})

test('no sick left asks the person to talk to HR', () => {
  const sick = buildBalanceCards(balance({ sickDays: 6, sickUsed: 6 }), [], 2026)[1]
  assert.deepEqual([sick.isEmpty, sick.note, sick.fraction], [true, 'Talk to HR if you need more', 0])
})

test('pending counts only this year and only waiting statuses', () => {
  const reqs = [
    req({ id: 'a', leaveDays: 2 }),
    req({ id: 'b', leaveDays: 0.5, status: 'LEAD_APPROVED' }),
    req({ id: 'c', leaveDays: 3, status: 'APPROVED' }),
    req({ id: 'd', leaveDays: 4, startDate: '2027-01-12', endDate: '2027-01-12' }),
  ]
  const [casual] = buildBalanceCards(balance(), reqs, 2026)
  assert.deepEqual([casual.pendingDays, casual.note], [2.5, '2.5 days pending'])
})

test('next leave is the earliest one not yet over', () => {
  const now = new Date(2026, 10, 11, 10)
  const reqs = [
    req({ id: 'ended', startDate: '2026-11-03', endDate: '2026-11-04', status: 'APPROVED' }),
    req({ id: 'cancelled', startDate: '2026-11-12', endDate: '2026-11-12', status: 'CANCELLED' }),
    req({ id: 'later', startDate: '2026-12-01', endDate: '2026-12-01', status: 'APPROVED' }),
    req({ id: 'soon', leaveType: 'SICK', startDate: '2026-11-19', endDate: '2026-11-23', status: 'PENDING' }),
  ]
  const n = nextLeave(reqs, now)
  assert.deepEqual([n?.requestId, n?.status, n?.label], ['soon', 'Waiting for approval', 'Sick'])
  assert.equal(nextLeave([reqs[0]], now), null)
  assert.equal(nextLeave([req({ id: 'ok', status: 'APPROVED' })], now)?.status, 'Approved')
})

test('the cards read "5 days left" and "of 10 days"', () => {
  const html = renderToStaticMarkup(
    createElement(BalanceCards, {
      cards: buildBalanceCards(balance({ casualUsed: 5 }), [], 2026),
      next: null,
      onOpenRequest: () => {},
    })
  )
  assert.match(html, />5<\/span>\s*<span[^>]*>days left/)
  assert.match(html, /of 10 days/)
  assert.match(html, /Nothing booked/)
  assert.doesNotMatch(html, /\d+ \/ \d+/)
})

test('an empty balance shows None and half days keep their decimal', () => {
  const html = renderToStaticMarkup(
    createElement(BalanceCards, {
      cards: buildBalanceCards(balance({ sickUsed: 6, annualUsed: 9.5 }), [], 2026),
      next: { type: 'CASUAL', label: 'Casual', range: '19 Nov', status: 'Approved', requestId: 'x' },
      onOpenRequest: () => {},
    })
  )
  assert.match(html, />None<\/span>/)
  assert.match(html, /Talk to HR if you need more/)
  assert.match(html, />4\.5<\/span>/)
  assert.match(html, /19 Nov/)
})
