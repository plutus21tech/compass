import test from 'node:test'
import assert from 'node:assert/strict'
import { daysLeftSuffix, formatCountOf, formatDays, formatDaysLeft } from '../lib/format-count'

test('formatDays', () => {
  assert.equal(formatDays(1), '1 day')
  assert.equal(formatDays(0.5), '0.5 days')
  assert.equal(formatDays(4.5), '4.5 days')
  assert.equal(formatDays(0), '0 days')
})

test('formatDaysLeft', () => {
  assert.equal(formatDaysLeft(5, 10), '5 days left of 10')
  assert.equal(formatDaysLeft(1, 10), '1 day left of 10')
  assert.equal(formatDaysLeft(4.5, 10), '4.5 days left of 10')
  assert.equal(formatDaysLeft(0, 6), 'None left of 6')
})

test('daysLeftSuffix', () => {
  assert.equal(daysLeftSuffix(5, 10), 'days left of 10')
  assert.equal(daysLeftSuffix(1, 10), 'day left of 10')
})

test('formatCountOf', () => {
  assert.equal(formatCountOf(3, 5), '3 of 5')
})
