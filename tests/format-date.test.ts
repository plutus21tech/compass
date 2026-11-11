import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatDate,
  formatDateRange,
  formatDateTime,
  formatMonthYear,
  formatTime,
  formatTimestampDate,
} from '../lib/format-date'

// Tuesday 10 Nov 2026, 12:00 in Karachi.
const NOW = new Date('2026-11-10T07:00:00Z')

test('formatDate: this year has no year', () => {
  assert.equal(formatDate('2026-11-05', { now: NOW }), 'Thu 5 Nov')
  assert.equal(formatDate('2026-11-05T00:00:00.000Z', { now: NOW }), 'Thu 5 Nov')
  assert.equal(formatDate(new Date(Date.UTC(2026, 10, 5)), { now: NOW }), 'Thu 5 Nov')
})

test('formatDate: other years show the year', () => {
  assert.equal(formatDate('2025-11-05', { now: NOW }), 'Wed 5 Nov 2025')
  assert.equal(formatDate('2027-01-05', { now: NOW }), 'Tue 5 Jan 2027')
})

test('year is judged in Karachi', () => {
  const karachiNewYear = new Date('2026-12-31T20:00:00Z') // 01:00 on 1 Jan 2027 in Karachi
  assert.equal(formatDate('2027-01-01', { now: karachiNewYear }), 'Fri 1 Jan')
})

test('fallbacks', () => {
  assert.equal(formatDate(null, { now: NOW }), '')
  assert.equal(formatDate(undefined, { now: NOW, fallback: 'No due date' }), 'No due date')
  assert.equal(formatDate('not a date', { now: NOW, fallback: '-' }), '-')
  assert.equal(formatDateTime('', { now: NOW, fallback: '-' }), '-')
  assert.equal(formatTime(null, { fallback: '' }), '')
})

test('timestamps use Karachi', () => {
  assert.equal(formatTimestampDate('2026-11-05T20:00:00Z', { now: NOW }), 'Fri 6 Nov')
  assert.equal(formatDateTime('2026-11-05T09:30:00Z', { now: NOW }), 'Thu 5 Nov, 14:30')
  assert.equal(formatDateTime('2026-11-05T20:00:00Z', { now: NOW }), 'Fri 6 Nov, 01:00')
  assert.equal(formatDateTime('2025-11-05T09:30:00Z', { now: NOW }), 'Wed 5 Nov 2025, 14:30')
  assert.equal(formatTime('2026-11-05T09:30:00Z'), '14:30')
})

test('formatDateRange', () => {
  assert.equal(formatDateRange('2026-11-19', '2026-11-19', { now: NOW }), 'Thu 19 Nov')
  assert.equal(formatDateRange('2026-11-19', '2026-11-23', { now: NOW }), 'Thu 19 – Mon 23 Nov')
  assert.equal(formatDateRange('2026-10-30', '2026-11-03', { now: NOW }), 'Fri 30 Oct – Tue 3 Nov')
  assert.equal(formatDateRange('2027-02-01', '2027-02-03', { now: NOW }), 'Mon 1 – Wed 3 Feb 2027')
  assert.equal(formatDateRange('2026-12-31', '2027-01-01', { now: NOW }), 'Thu 31 Dec 2026 – Fri 1 Jan 2027')
})

test('formatMonthYear', () => {
  assert.equal(formatMonthYear('2026-11-01'), 'November 2026')
})
