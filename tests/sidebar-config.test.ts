import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ADMIN_SIDEBAR, EMPLOYEE_SIDEBAR, ONBOARDING_SIDEBAR, SECURITY_SIDEBAR,
  flattenNav, resolveLockedSidebarConfig, resolveSidebarConfig, searchablePages,
  type MenuContext, type SidebarConfig,
} from '../components/layout/sidebar-config'

const base: MenuContext = { role: 'EMPLOYEE', hasClientele: false, weekly: { enabled: false, openCount: 0 }, securityChecks: { enabled: false, console: false } }
const ctx = (patch: Partial<MenuContext>): MenuContext => ({ ...base, ...patch })
const shape = (c: SidebarConfig) => ({
  items: c.items.map((i) => i.href),
  groups: c.groups.map((g) => [g.label, ...g.items.map((i) => i.label)]),
  pinned: (c.pinned ?? []).map((i) => i.label),
})
const hrefs = (c: SidebarConfig) => flattenNav(c).map((i) => i.href)

test('the employee menu is grouped You, Work, Company with Help & IT and Profile pinned', () => {
  assert.deepEqual(shape(resolveSidebarConfig(EMPLOYEE_SIDEBAR, base)), {
    items: [],
    groups: [['You', 'Home', 'Time off', 'Evaluations'], ['Work', 'My work', 'Projects'], ['Company', 'People', 'Handbook', 'Office']],
    pinned: ['Help & IT', 'Profile'],
  })
})

test('every page the old employee menu linked to is still there', () => {
  const now = hrefs(resolveSidebarConfig(EMPLOYEE_SIDEBAR, base))
  for (const href of ['/dashboard', '/my-tasks', '/evaluations/weekly', '/leave', '/projects', '/device-support', '/office', '/handbook', '/profile']) assert.ok(now.includes(href), href)
})

test('Clients follows Projects only with clientele access', () => {
  assert.deepEqual(shape(resolveSidebarConfig(EMPLOYEE_SIDEBAR, ctx({ hasClientele: true }))).groups[1], ['Work', 'My work', 'Projects', 'Clients'])
  assert.ok(!hrefs(resolveSidebarConfig(ADMIN_SIDEBAR, ctx({ role: 'HR', hasClientele: true }))).includes('/clientele'))
})

test('Evaluations carries the open count, and no badge at zero', () => {
  const find = (c: SidebarConfig) => flattenNav(c).find((i) => i.href === '/evaluations/weekly')
  assert.equal(find(resolveSidebarConfig(EMPLOYEE_SIDEBAR, ctx({ weekly: { enabled: true, openCount: 3 } })))?.badge, 3)
  assert.equal(find(resolveSidebarConfig(EMPLOYEE_SIDEBAR, ctx({ weekly: { enabled: true, openCount: 0 } })))?.badge, undefined)
})

test('with Security Checks on, Help & IT opens /security-checks', () => {
  const pinned = resolveSidebarConfig(EMPLOYEE_SIDEBAR, ctx({ securityChecks: { enabled: true, console: false } })).pinned ?? []
  assert.deepEqual(pinned.map((i) => [i.label, i.href]), [['Help & IT', '/security-checks'], ['Profile', '/profile']])
})

test('O&A get Payment details and EXECUTION gets Subscription Management at the end of Work', () => {
  assert.deepEqual(shape(resolveSidebarConfig(EMPLOYEE_SIDEBAR, ctx({ role: 'OA' }))).groups[1], ['Work', 'My work', 'Projects', 'Payment details'])
  assert.deepEqual(shape(resolveSidebarConfig(EMPLOYEE_SIDEBAR, ctx({ role: 'EXECUTION', hasClientele: true }))).groups[1], ['Work', 'My work', 'Projects', 'Clients', 'Subscription Management'])
})

test('locked hires keep the onboarding menu', () => {
  assert.deepEqual(hrefs(resolveLockedSidebarConfig(ONBOARDING_SIDEBAR)), ['/onboarding', '/handbook', '/profile'])
})

test("the admin console keeps every item in today's order", () => {
  const c = resolveSidebarConfig(ADMIN_SIDEBAR, ctx({ role: 'HR', weekly: { enabled: true, openCount: 2 }, securityChecks: { enabled: true, console: true } }))
  assert.deepEqual(hrefs(c), [
    '/admin', '/admin/users', '/admin/org-chart',
    '/admin/evaluation-round', '/admin/settings', '/admin/reports',
    '/admin/clients', '/admin/leave', '/admin/device-tickets', '/admin/assets', '/admin/payroll', '/admin/subscriptions', '/office', '/admin/handbook', '/security-checks',
    '/admin/onboarding', '/admin/onboarding/positions', '/admin/onboarding/new-hires', '/admin/onboarding/academy/modules', '/admin/onboarding/academy/quiz', '/admin/onboarding/benefits', '/admin/onboarding/config',
    '/admin/onboarding/academy/library', '/admin/onboarding/academy/contacts', '/admin/onboarding/academy/links', '/admin/onboarding/academy/assign', '/admin/onboarding/academy/checklist', '/admin/onboarding/academy/videos',
    '/admin/analytics', '/admin/employee-360',
  ])
  assert.deepEqual(c.groups.map((g) => [g.label, g.collapsible ?? true, g.defaultOpen ?? false]), [
    ['People', true, true], ['Performance', true, true], ['Operations', true, false], ['Onboarding', true, false], ['Insights', true, false],
  ])
})

test("the security console keeps its items; Security takes Device Tickets' place", () => {
  assert.deepEqual(hrefs(resolveSidebarConfig(SECURITY_SIDEBAR, ctx({ role: 'SECURITY' }))), ['/security', '/security/device-tickets', '/security/assets', '/security/onboarding', '/office', '/profile'])
  const on = flattenNav(resolveSidebarConfig(SECURITY_SIDEBAR, ctx({ role: 'SECURITY', securityChecks: { enabled: true, console: true } })))
  assert.deepEqual(on.map((i) => i.label), ['Home', 'Security', 'Assets', 'Onboarding', 'Office', 'Profile'])
})

test('the shared configs are never mutated', () => {
  const before = JSON.stringify([EMPLOYEE_SIDEBAR, ADMIN_SIDEBAR, SECURITY_SIDEBAR].map(hrefs))
  resolveSidebarConfig(EMPLOYEE_SIDEBAR, ctx({ role: 'EXECUTION', hasClientele: true, weekly: { enabled: true, openCount: 1 }, securityChecks: { enabled: true, console: true } }))
  resolveSidebarConfig(ADMIN_SIDEBAR, ctx({ role: 'HR', weekly: { enabled: true, openCount: 1 }, securityChecks: { enabled: true, console: true } }))
  assert.equal(JSON.stringify([EMPLOYEE_SIDEBAR, ADMIN_SIDEBAR, SECURITY_SIDEBAR].map(hrefs)), before)
})

test('search pages cover the employee menu, the role console and the footer switch, each once', () => {
  const hr = ctx({ role: 'HR' })
  const pages = searchablePages(resolveSidebarConfig(ADMIN_SIDEBAR, hr), hr)
  const all = pages.map((p) => p.href)
  assert.equal(new Set(all).size, all.length)
  for (const href of ['/admin/users', '/leave', '/people', '/admin']) assert.ok(all.includes(href), href)
  assert.equal(pages.find((p) => p.href === '/leave')?.section, 'You')
  const employee = searchablePages(resolveSidebarConfig(EMPLOYEE_SIDEBAR, base), base).map((p) => p.href)
  assert.ok(!employee.some((h) => h.startsWith('/admin') || h.startsWith('/security')))
})
