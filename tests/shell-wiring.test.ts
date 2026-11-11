import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (file: string) => readFileSync(join(__dirname, '..', file), 'utf8')
const layout = read('components/layout/SidebarLayout.tsx')
const sidebar = read('components/layout/AppSidebar.tsx')

test('no splash screen: the shell renders skeletons, not LoadingScreen', () => {
  assert.doesNotMatch(layout, /LoadingScreen/)
  assert.match(layout, /SidebarSkeleton/)
  assert.match(layout, /PageSkeleton/)
})

test('the session redirects and the onboarding lockout are still wired', () => {
  assert.match(layout, /router\.push\('\/login'\)/)
  assert.match(layout, /router\.push\('\/dashboard'\)/)
  assert.match(layout, /shouldRedirectLockedPage\(pathname\)/)
  assert.match(layout, /router\.push\('\/onboarding'\)/)
  assert.match(layout, /resolveLockedSidebarConfig\(/)
  assert.match(layout, /resolveSidebarConfig\(/)
})

test('the menu pipeline lives in the resolver, not the components', () => {
  assert.doesNotMatch(layout, /withSecurityChecksNav|withOaPaymentNav|items\.splice/)
  assert.doesNotMatch(sidebar, /execution\/subscriptions/)
})

test('footer role switches and the collapse toggle are untouched', () => {
  for (const text of ['Admin Console', 'Employee View', 'Payroll (O&A)', 'Security Console', 'Collapse']) assert.ok(sidebar.includes(text), text)
  assert.match(layout, /localStorage\.setItem\('sidebar-collapsed'/)
})

test('the pinned block is a sibling outside the space-y container so mt-auto works', () => {
  assert.doesNotMatch(sidebar, /<nav[^>]*space-y/)
  const inner = sidebar.indexOf('<div className="space-y-1">')
  const pinned = sidebar.indexOf('data-pinned')
  assert.ok(inner > 0 && pinned > inner)
  // the space-y wrapper closes before the pinned block starts
  const between = sidebar.slice(inner, pinned)
  assert.ok((between.match(/<div/g) ?? []).length <= (between.match(/<\/div>/g) ?? []).length + 1)
})
