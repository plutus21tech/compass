import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSearchQuery } from '../lib/search/query'

test('queries are trimmed, collapsed, bounded', () => {
  assert.equal(parseSearchQuery('  time   off '), 'time off')
  assert.equal(parseSearchQuery('a'), null)
  assert.equal(parseSearchQuery(null), null)
  assert.equal(parseSearchQuery(undefined), null)
  assert.equal(parseSearchQuery('x'.repeat(100))?.length, 64)
})
