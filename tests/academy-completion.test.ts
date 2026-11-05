import test from 'node:test'
import assert from 'node:assert/strict'
import type { Block } from '../lib/academy/blocks'
import { effectiveRule, evaluateCompletion, type CompletionInput } from '../lib/academy/completion'

const checklist = (...keys: string[]): Block => ({ type: 'checklist', items: keys.map((key) => ({ key, label: key })) })
const state = { checks: {}, linksOpenedAt: {}, scrolledToEnd: false }
const base: CompletionInput = {
  rule: 'SCROLL_END',
  blocks: [],
  state,
  tutorialKeys: [],
  discordUsername: null,
  securityAckSigned: false,
  payment: { kind: 'PK', bankSaved: false },
}
const run = (over: Partial<CompletionInput>) => evaluateCompletion({ ...base, ...over })
const reason = (r: ReturnType<typeof evaluateCompletion>) => (r.met ? null : r.reason)

test('SCROLL_END', () => {
  assert.equal(reason(run({})), 'Read to the end of this page first.')
  assert.deepEqual(run({ state: { ...state, scrolledToEnd: true } }), { met: true })
})

test('BUDDY_HELLO needs the buddy-hello tick', () => {
  const blocks = [checklist('buddy-hello')]
  assert.equal(reason(run({ rule: 'BUDDY_HELLO', blocks })), "Tick the box once you've said hello to your buddy.")
  assert.deepEqual(run({ rule: 'BUDDY_HELLO', blocks, state: { ...state, checks: { 'buddy-hello': true } } }), { met: true })
})

test('ALL_LINKS_OPENED counts the unopened tutorials', () => {
  const r = run({ rule: 'ALL_LINKS_OPENED', tutorialKeys: ['a', 'b', 'c'], state: { ...state, linksOpenedAt: { a: 'x' } } })
  assert.equal(reason(r), 'Open each tutorial first. 2 to go.')
  const done = run({ rule: 'ALL_LINKS_OPENED', tutorialKeys: ['a'], state: { ...state, linksOpenedAt: { a: 'x' } } })
  assert.deepEqual(done, { met: true })
})

test('CHECKLIST_AND_FIELD', () => {
  const blocks = [checklist('a', 'b')]
  const checks = { a: true, b: true }
  const msg = 'Tick every step and save your Discord username.'
  assert.equal(reason(run({ rule: 'CHECKLIST_AND_FIELD', blocks, state: { ...state, checks }, discordUsername: null })), msg)
  assert.equal(reason(run({ rule: 'CHECKLIST_AND_FIELD', blocks, state: { ...state, checks: { a: true } }, discordUsername: 'x' })), msg)
  assert.deepEqual(run({ rule: 'CHECKLIST_AND_FIELD', blocks, state: { ...state, checks }, discordUsername: 'x' }), { met: true })
})

test('CHECKLIST_AND_ACK', () => {
  const blocks = [checklist('a')]
  const s = { ...state, checks: { a: true } }
  assert.equal(reason(run({ rule: 'CHECKLIST_AND_ACK', blocks, state: s })), 'Tick every step and sign the acknowledgement.')
  assert.deepEqual(run({ rule: 'CHECKLIST_AND_ACK', blocks, state: s, securityAckSigned: true }), { met: true })
})

test('a checklist item inside a hidden conditional is not required', () => {
  const hidden: Block = { type: 'conditional', when: { clientAccountSet: true }, children: [checklist('client-only')] }
  // filterBlocks has already removed the hidden conditional
  const filtered = [hidden].filter((b) => b.type !== 'conditional')
  const r = run({ rule: 'CHECKLIST_AND_ACK', blocks: [checklist('a'), ...filtered], state: { ...state, checks: { a: true } }, securityAckSigned: true })
  assert.deepEqual(r, { met: true })
})

test('a checklist nested in a conditional that survived filtering is flattened and required', () => {
  const r = run({ rule: 'CHECKLIST_AND_ACK', blocks: [checklist('a', 'b')], state: { ...state, checks: { a: true } }, securityAckSigned: true })
  assert.equal(reason(r), 'Tick every step and sign the acknowledgement.')
})

test('FIELD_SUBMITTED', () => {
  assert.equal(reason(run({ rule: 'FIELD_SUBMITTED' })), 'Paste your LinkedIn link first.')
  assert.deepEqual(run({ rule: 'FIELD_SUBMITTED', state: { ...state, linkedinUrl: 'https://l.in/x' } }), { met: true })
})

test('PAYMENT_SETUP PK needs only the bank', () => {
  const r = run({ rule: 'PAYMENT_SETUP', payment: { kind: 'PK', bankSaved: false } })
  assert.equal(reason(r), 'Save your bank details first.')
  assert.deepEqual(run({ rule: 'PAYMENT_SETUP', payment: { kind: 'PK', bankSaved: true } }), { met: true })
})

test('PAYMENT_SETUP OTHER needs payout and the invoice-template tick', () => {
  const blocks = [checklist('invoice-template')]
  const msg = 'Save your payout details and tick the invoice template box.'
  const noTick = run({ rule: 'PAYMENT_SETUP', blocks, payment: { kind: 'OTHER', payoutSaved: true } })
  assert.equal(reason(noTick), msg)
  const s = { ...state, checks: { 'invoice-template': true } }
  assert.equal(reason(run({ rule: 'PAYMENT_SETUP', blocks, state: s, payment: { kind: 'OTHER', payoutSaved: false } })), msg)
  assert.deepEqual(run({ rule: 'PAYMENT_SETUP', blocks, state: s, payment: { kind: 'OTHER', payoutSaved: true } }), { met: true })
})

test('LINK_OPENED', () => {
  assert.equal(reason(run({ rule: 'LINK_OPENED' })), 'Open the Company Dashboard first.')
  assert.deepEqual(run({ rule: 'LINK_OPENED', state: { ...state, linksOpenedAt: { COMPANY_DASHBOARD: 'x' } } }), { met: true })
})

test('VIDEO_95 is evaluated as SCROLL_END', () => {
  assert.equal(reason(run({ rule: 'VIDEO_95' })), 'Read to the end of this page first.')
  assert.deepEqual(run({ rule: 'VIDEO_95', state: { ...state, scrolledToEnd: true } }), { met: true })
})

test('a checklist is not required by a non-checklist rule', () => {
  assert.deepEqual(run({ rule: 'SCROLL_END', blocks: [checklist('a')], state: { ...state, scrolledToEnd: true } }), { met: true })
})

test('effectiveRule fallbacks', () => {
  const facts = { tutorialCount: 2, dashboardLinkSet: true }
  assert.equal(effectiveRule('VIDEO_95', facts), 'SCROLL_END')
  assert.equal(effectiveRule('ALL_LINKS_OPENED', { ...facts, tutorialCount: 0 }), 'SCROLL_END')
  assert.equal(effectiveRule('ALL_LINKS_OPENED', facts), 'ALL_LINKS_OPENED')
  assert.equal(effectiveRule('LINK_OPENED', { ...facts, dashboardLinkSet: false }), 'SCROLL_END')
  assert.equal(effectiveRule('LINK_OPENED', facts), 'LINK_OPENED')
  assert.equal(effectiveRule('BUDDY_HELLO', facts), 'BUDDY_HELLO')
})
