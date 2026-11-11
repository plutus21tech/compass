import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { notePublicHolidayFailures } from '@/lib/time-off/holiday-warnings'

test('a month that failed to load warns once, not on every date change', () => {
  const first = notePublicHolidayFailures(new Set(), ['2026-10'])
  assert.equal(first.warn, true)
  const again = notePublicHolidayFailures(first.warned, ['2026-10'])
  assert.equal(again.warn, false)
  const other = notePublicHolidayFailures(again.warned, ['2026-10', '2026-11'])
  assert.equal(other.warn, true)
  assert.deepEqual([...other.warned].sort(), ['2026-10', '2026-11'])
})

test('no failures, no warning, and the previous set is not mutated', () => {
  const before = new Set(['2026-10'])
  const result = notePublicHolidayFailures(before, [])
  assert.equal(result.warn, false)
  const next = notePublicHolidayFailures(before, ['2026-12'])
  assert.deepEqual([...before], ['2026-10'])
  assert.notEqual(next.warned, before)
})

test('holidayKeysFor routes its toast through the once-per-month guard', () => {
  const src = readFileSync('components/leave/time-off/useTimeOffData.ts', 'utf8')
  assert.match(src, /notePublicHolidayFailures\(/)
  assert.doesNotMatch(src, /if \(failed\) toast\.error\(HOLIDAY_ERROR\)/)
})
