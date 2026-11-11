import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nextLeavePhrase, summariseTimeOff, type BalanceInput } from '../lib/home/time-off'
import { formatDateRange } from '../lib/format-date'
import type { OwnLeaveRow } from '../lib/home/needs-you-sources'

const balance = (over: Partial<BalanceInput> = {}): BalanceInput => ({
  casualDays: 10, casualUsed: 5, sickDays: 8, sickUsed: 8.5, annualDays: 14, annualUsed: 0, ...over,
})

const row = (over: Partial<OwnLeaveRow>): OwnLeaveRow => ({
  id: 'r', leaveType: 'ANNUAL', status: 'APPROVED', isHalfDay: false,
  startDate: '2026-11-19T00:00:00.000Z', endDate: '2026-11-23T00:00:00.000Z', ...over,
})

describe('time off', () => {
  it('totals, decimals and none left', () => {
    const s = summariseTimeOff(balance(), [], '2026-11-11')
    assert.equal(s.totalLeft, 19)
    assert.equal(s.partsPhrase, '5 casual · 14 annual · No sick left')
    assert.equal(s.totalPhrase, '19 days left')
    assert.deepEqual(s.parts.map((p) => [p.type, p.left, p.total]), [['CASUAL', 5, 10], ['ANNUAL', 14, 14], ['SICK', 0, 8]])
    assert.match(summariseTimeOff(balance({ casualUsed: 5.5 }), [], '2026-11-11').partsPhrase, /^4\.5 casual/)
    const none = summariseTimeOff(balance({ casualUsed: 10, annualUsed: 14, sickUsed: 8 }), [], '2026-11-11')
    assert.equal(none.totalPhrase, 'No days left')
    assert.equal(none.totalLeft, 0)
  })

  it('next leave is the earliest one not over, pending marked', () => {
    const rows = [
      row({ id: 'old', startDate: '2026-11-08T00:00:00.000Z', endDate: '2026-11-10T00:00:00.000Z' }),
      row({ id: 'rej', status: 'REJECTED', startDate: '2026-11-17T00:00:00.000Z', endDate: '2026-11-18T00:00:00.000Z' }),
      row({ id: 'p', status: 'PENDING' }),
    ]
    const s = summariseTimeOff(balance(), rows, '2026-11-11')
    assert.equal(s.nextLeave?.pending, true)
    assert.equal(
      nextLeavePhrase(s.nextLeave),
      `Next: ${formatDateRange('2026-11-19T00:00:00.000Z', '2026-11-23T00:00:00.000Z')}, annual (waiting for approval)`
    )
  })

  it('a leave in progress still counts, and earliest start wins', () => {
    const rows = [
      row({ id: 'later', startDate: '2026-12-01T00:00:00.000Z', endDate: '2026-12-02T00:00:00.000Z' }),
      row({ id: 'now', leaveType: 'SICK', startDate: '2026-11-10T00:00:00.000Z', endDate: '2026-11-11T00:00:00.000Z' }),
    ]
    const s = summariseTimeOff(balance(), rows, '2026-11-11')
    assert.equal(s.nextLeave?.type, 'SICK')
    assert.doesNotMatch(nextLeavePhrase(s.nextLeave), /waiting/)
  })

  it('no leave booked', () => {
    assert.equal(nextLeavePhrase(summariseTimeOff(balance(), [], '2026-11-11').nextLeave), 'No leave booked yet')
    assert.equal(nextLeavePhrase(null), 'No leave booked yet')
  })
})
