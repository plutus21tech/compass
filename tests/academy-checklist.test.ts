import test from 'node:test'
import assert from 'node:assert/strict'
import { AUTO_TICK_EVENTS, canTickItem, checklistDueAt, eventsMet, toItemState, type ChecklistFacts } from '../lib/academy/checklist'

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

test('checklistDueAt applies calendar days', () => {
  assert.equal(checklistDueAt(day('2026-12-01'), -14).toISOString(), '2026-11-17T00:00:00.000Z')
  assert.equal(checklistDueAt(day('2026-12-01'), 0).toISOString(), '2026-12-01T00:00:00.000Z')
})

test('checklistDueAt moves a Saturday back to the Friday', () => {
  // 2026-12-05 is a Saturday: joining 2026-12-12 minus 7.
  assert.equal(checklistDueAt(day('2026-12-12'), -7).toISOString(), '2026-12-04T00:00:00.000Z')
})

test('checklistDueAt moves a Sunday back to the Friday', () => {
  // 2026-12-06 is a Sunday: joining 2026-12-13 minus 7.
  assert.equal(checklistDueAt(day('2026-12-13'), -7).toISOString(), '2026-12-04T00:00:00.000Z')
})

const none: ChecklistFacts = {
  leadInputSubmitted: false, setupReady: false, userLinked: false, courseReleased: false,
  discordSaved: false, securityAckSigned: false, linkedinVerified: false, paymentSetupDone: false, courseCompleted: false,
}
const FACT_FOR_EVENT: Record<string, keyof ChecklistFacts> = {
  LEAD_INPUT_SUBMITTED: 'leadInputSubmitted', SETUP_READY: 'setupReady', ACCOUNT_LINKED: 'userLinked',
  COURSE_RELEASED: 'courseReleased', DISCORD_USERNAME_SAVED: 'discordSaved', SECURITY_ACK_SIGNED: 'securityAckSigned',
  LINKEDIN_VERIFIED: 'linkedinVerified', PAYMENT_SETUP_DONE: 'paymentSetupDone', COURSE_COMPLETED: 'courseCompleted',
}

test('there are nine auto-tick events', () => {
  assert.equal(AUTO_TICK_EVENTS.length, 9)
})

for (const event of AUTO_TICK_EVENTS) {
  test(`eventsMet: ${event} true and false`, () => {
    assert.equal(eventsMet(none).has(event), false)
    assert.equal(eventsMet(none).size, 0)
    const met = eventsMet({ ...none, [FACT_FOR_EVENT[event]]: true })
    assert.deepEqual([...met], [event])
  })
}

const due = day('2026-12-01')
const open = { dueAt: due, doneAt: null, autoTicked: false, missReason: null }

test('toItemState: open until the end of the due day, then overdue', () => {
  assert.equal(toItemState(open, new Date('2026-12-01T23:59:59.000Z')), 'OPEN')
  assert.equal(toItemState(open, new Date('2026-12-02T00:00:00.000Z')), 'OVERDUE')
})

test('toItemState: done on time, late with reason, late without reason', () => {
  const on = { ...open, doneAt: new Date('2026-11-30T10:00:00.000Z') }
  assert.equal(toItemState(on, new Date('2027-01-01')), 'DONE')
  const late = { ...open, doneAt: new Date('2026-12-05T10:00:00.000Z') }
  assert.equal(toItemState({ ...late, missReason: 'Laptop delayed' }, new Date('2027-01-01')), 'DONE_LATE')
  assert.equal(toItemState({ ...late, autoTicked: true }, new Date('2027-01-01')), 'DONE_LATE_NEEDS_REASON')
})

test('canTickItem: HR any, SECURITY and OA their own, the assigned lead team-lead items', () => {
  const item = (ownerRole: 'HR' | 'SECURITY' | 'OA' | 'TEAM_LEAD') => ({ ownerRole })
  for (const owner of ['HR', 'SECURITY', 'OA', 'TEAM_LEAD'] as const) assert.equal(canTickItem('HR', item(owner), 'l', 'h'), true)
  assert.equal(canTickItem('SECURITY', item('SECURITY'), 'l', 's'), true)
  assert.equal(canTickItem('SECURITY', item('OA'), 'l', 's'), false)
  assert.equal(canTickItem('SECURITY', item('TEAM_LEAD'), 'l', 's'), false)
  assert.equal(canTickItem('OA', item('OA'), 'l', 'o'), true)
  assert.equal(canTickItem('OA', item('HR'), 'l', 'o'), false)
  assert.equal(canTickItem('EMPLOYEE', item('TEAM_LEAD'), 'l', 'l'), true)
  assert.equal(canTickItem('EMPLOYEE', item('TEAM_LEAD'), 'l', 'x'), false)
  assert.equal(canTickItem('EMPLOYEE', item('HR'), 'l', 'l'), false)
  assert.equal(canTickItem('EMPLOYEE', item('TEAM_LEAD'), null, 'l'), false)
})
