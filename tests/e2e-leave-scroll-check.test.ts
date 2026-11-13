import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// documentElement never scrolls in the app shell (main does), so measuring it could never fail.
const spec = readFileSync('e2e/leave.spec.ts', 'utf8')

test('the mobile horizontal-scroll check measures the scrolling main element and the open panel', () => {
  assert.doesNotMatch(spec, /document\.documentElement\.scrollWidth/)
  assert.match(spec, /querySelector\('main'\)/)
  assert.match(spec, /el.scrollWidth - el.clientWidth/)
  assert.match(spec, /request-panel-title/)
})
