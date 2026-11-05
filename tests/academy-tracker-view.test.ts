import test from 'node:test'
import assert from 'node:assert/strict'
import type { ChecklistItemView } from '../lib/academy/checklist'
import {
  checklistChip,
  checklistNeedsReason,
  hireStatusLabel,
  moduleChip,
  paymentChip,
  paymentMethodLabel,
  progressText,
  trackerEmptyMessage,
} from '../lib/academy/tracker-labels'

const item = (over: Partial<ChecklistItemView>): ChecklistItemView => ({
  id: 'i', key: 'k', title: 'T', ownerRole: 'HR', autoTickEvent: null, dueAt: '2026-12-01T00:00:00Z',
  doneAt: null, doneById: null, autoTicked: false, missReason: null, state: 'OPEN', ...over,
})

test('progressText: "x of y", and a course not yet released', () => {
  assert.equal(progressText(3, 14), '3 of 14')
  assert.equal(progressText(0, 0), 'Not released')
  assert.equal(progressText(0, 0, 'None yet'), 'None yet')
})

test('checklistChip: each state has a label and a tone', () => {
  assert.deepEqual(checklistChip('OPEN'), { label: 'Open', tone: 'neutral' })
  assert.deepEqual(checklistChip('OVERDUE'), { label: 'Overdue', tone: 'danger' })
  assert.deepEqual(checklistChip('DONE'), { label: 'Done', tone: 'success' })
  assert.deepEqual(checklistChip('DONE_LATE'), { label: 'Done late', tone: 'warning' })
  assert.deepEqual(checklistChip('DONE_LATE_NEEDS_REASON'), { label: 'Closed late, reason needed', tone: 'danger' })
})

test('checklistNeedsReason: a tick on an overdue item, or a late close with no reason', () => {
  assert.equal(checklistNeedsReason(item({ state: 'OVERDUE' })), true)
  assert.equal(checklistNeedsReason(item({ state: 'DONE_LATE_NEEDS_REASON', doneAt: '2026-12-09T00:00:00Z' })), true)
  assert.equal(checklistNeedsReason(item({ state: 'OPEN' })), false)
  assert.equal(checklistNeedsReason(item({ state: 'DONE' })), false)
  assert.equal(checklistNeedsReason(item({ state: 'DONE_LATE', missReason: 'Away' })), false)
})

test('moduleChip and hireStatusLabel', () => {
  assert.equal(moduleChip('LOCKED').label, 'Locked')
  assert.equal(moduleChip('AVAILABLE').label, 'Available')
  assert.equal(moduleChip('IN_PROGRESS').label, 'In progress')
  assert.equal(moduleChip('COMPLETED').label, 'Completed')
  assert.equal(hireStatusLabel('PENDING'), 'Pending')
  assert.equal(hireStatusLabel('ONBOARDING'), 'Onboarding')
  assert.equal(hireStatusLabel('COMPLETED'), 'Completed')
})

test('payment labels', () => {
  assert.equal(paymentMethodLabel('WISE'), 'Wise')
  assert.equal(paymentMethodLabel('PAYONEER'), 'Payoneer')
  assert.equal(paymentMethodLabel('BANK_TRANSFER'), 'Bank transfer')
  assert.equal(paymentMethodLabel('PK_BANK'), 'Pakistan bank account')
  assert.equal(paymentMethodLabel('OTHER'), 'Other')
  assert.deepEqual(paymentChip({ saved: true, method: 'WISE' }), { label: 'Saved', tone: 'success' })
  assert.deepEqual(paymentChip({ saved: false, method: null }), { label: 'Not added', tone: 'neutral' })
})

test('trackerEmptyMessage: with and without filters', () => {
  assert.equal(trackerEmptyMessage(false), 'No one is onboarding right now.')
  assert.equal(trackerEmptyMessage(true), 'No one matches these filters.')
})

test('paymentFieldLabel: known fields read plainly, unknown ones are spaced out', async () => {
  const { paymentFieldLabel } = await import('../lib/academy/tracker-labels')
  assert.equal(paymentFieldLabel('accountNumberOrIban'), 'Account number or IBAN')
  assert.equal(paymentFieldLabel('someNewField'), 'Some new field')
})
