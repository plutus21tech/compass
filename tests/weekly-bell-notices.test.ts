import assert from 'node:assert/strict'
import test from 'node:test'
import { yourChange } from '../lib/weekly/emails'
import { decisionBellForOther, decisionBellForRequester, expiredBell, formsOpenBell, listChangedBell } from '../lib/weekly/service/bell-notices'

test("the requester hears the decision in the email's words", () => {
  const bell = decisionBellForRequester({ requestId: 'pr1', approved: false, action: 'ADD', relation: 'PEER', otherName: 'Cara Lindqvist' })
  assert.equal(bell.kind, 'WEEKLY_LIST_DECISION')
  assert.equal(bell.title, `Your request to ${yourChange({ action: 'ADD', relation: 'PEER' }, 'Cara Lindqvist')} was not approved`)
  assert.equal(bell.link, '/evaluations/weekly')
  assert.equal(bell.dedupeKey, 'bell:peer-request-outcome:pr1')
  const yes = decisionBellForRequester({ requestId: 'pr1', approved: true, action: 'REMOVE', relation: 'LEAD', otherName: 'Cara Lindqvist' })
  assert.equal(yes.title, `Your request to ${yourChange({ action: 'REMOVE', relation: 'LEAD' }, 'Cara Lindqvist')} was approved`)
})

test('the other person hears the outcome', () => {
  const yes = decisionBellForOther({ requestId: 'pr1', approved: true, requesterName: 'Ben Okafor' })
  assert.equal(yes.title, 'HR changed your evaluation lists after a request from Ben Okafor')
  assert.equal(yes.dedupeKey, 'bell:peer-request-outcome:pr1:other')
  const no = decisionBellForOther({ requestId: 'pr1', approved: false, requesterName: 'Ben Okafor' })
  assert.equal(no.title, "HR did not approve Ben Okafor's request about you")
  assert.equal(no.kind, 'WEEKLY_LIST_DECISION')
  assert.equal(no.link, '/evaluations/weekly')
})

test('an expired request tells the requester and the peer', () => {
  const req = expiredBell({ requestId: 'pr2', otherName: 'Cara Lindqvist', forPeer: false })
  assert.equal(req.title, 'Your request about Cara Lindqvist lapsed when the round opened')
  assert.equal(req.dedupeKey, 'bell:peer-request-expired:pr2')
  const peer = expiredBell({ requestId: 'pr2', otherName: 'Ben Okafor', forPeer: true })
  assert.equal(peer.title, "Ben Okafor's request about you lapsed when the round opened")
  assert.equal(peer.dedupeKey, 'bell:peer-request-expired:pr2:peer')
})

test('a list change carries the email sentence', () => {
  const bell = listChangedBell({ text: 'HR added Cara Lindqvist as a peer for Q4 2026.', dedupeKey: 'list-changed:c1:u1' })
  assert.equal(bell.kind, 'WEEKLY_LIST_CHANGED')
  assert.equal(bell.title, 'HR added Cara Lindqvist as a peer for Q4 2026.')
  assert.equal(bell.link, '/evaluations/weekly')
  assert.equal(bell.dedupeKey, 'bell:list-changed:c1:u1')
})

test('forms opening is once per round and uses the email link', () => {
  const people = formsOpenBell({ userId: 'u1', cycleId: 'c1', href: '/evaluations/weekly', partner: false })
  assert.equal(people.kind, 'WEEKLY_FORMS_OPEN')
  assert.equal(people.title, 'Quarter-end forms are open')
  assert.equal(people.link, '/evaluations/weekly')
  assert.equal(people.dedupeKey, 'bell:weekly-forms-open:u1:c1')
  const hr = formsOpenBell({ userId: 'u1', cycleId: 'c1', href: '/admin/evaluation-round?tab=forms', partner: true })
  assert.equal(hr.title, 'Your quarter-end tables are open')
  assert.equal(hr.link, '/admin/evaluation-round?tab=forms')
})
