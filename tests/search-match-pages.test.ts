import test from 'node:test'
import assert from 'node:assert/strict'
import { EMPLOYEE_SIDEBAR, resolveSidebarConfig, searchablePages, type MenuContext } from '../components/layout/sidebar-config'
import { matchPages } from '../lib/search/match-pages'

const ctx: MenuContext = { role: 'EMPLOYEE', hasClientele: true, weekly: { enabled: false, openCount: 0 }, securityChecks: { enabled: false, console: false } }
const pages = searchablePages(resolveSidebarConfig(EMPLOYEE_SIDEBAR, ctx), ctx)

test('old names find renamed pages', () => {
  const first = (q: string) => matchPages(pages, q)[0]?.href
  assert.equal(first('leave'), '/leave')
  assert.equal(first('my tasks'), '/my-tasks')
  assert.equal(first('device support'), '/device-support')
  assert.equal(first('clientele'), '/clientele')
  assert.equal(first('org chart'), '/people')
  assert.equal(first('directory'), '/people')
})

test('label prefix beats a keyword match, and case does not matter', () => {
  assert.equal(matchPages(pages, 'PRO')[0].href, '/projects')
  assert.equal(matchPages(pages, 'profile')[0].href, '/profile')
})

test('an empty query lists the menu in order, up to the limit', () => {
  assert.deepEqual(matchPages(pages, '', 3).map((p) => p.href), ['/dashboard', '/leave', '/evaluations/weekly'])
})
