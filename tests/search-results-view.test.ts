import test from 'node:test'
import assert from 'node:assert/strict'
import { searchView } from '../components/search/use-search-results'
import type { SearchResults } from '../lib/search/service'

const results = { people: [], handbook: [], projects: [], tasks: [] } as unknown as SearchResults

test('results for an older query are never shown for the current one: it reads as loading', () => {
  const view = searchView({ results, loading: false, error: null, answered: 'ali' }, 'alic')
  assert.deepEqual(view, { results: null, loading: true, error: null })
})

test('results that answer the current query are shown as they are', () => {
  const view = searchView({ results, loading: false, error: null, answered: 'alice' }, 'alice')
  assert.deepEqual(view, { results, loading: false, error: null })
})

test('no query means idle', () => {
  assert.deepEqual(searchView({ results, loading: false, error: null, answered: 'alice' }, null), { results: null, loading: false, error: null })
})
