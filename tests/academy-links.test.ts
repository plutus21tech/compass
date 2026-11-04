import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACADEMY_LINK_KEYS,
  academyConfigInputSchema,
  academyLinkSchema,
  libraryCardSchema,
  resolveAcademyLink,
  sanitizeStoredLinks,
} from '../lib/academy/links'
import { withAcademyNav } from '../components/layout/sidebar-nav'
import type { SidebarConfig } from '../components/layout/AppSidebar'

test('academyLinkSchema accepts handbook slugs and https urls', () => {
  assert.ok(academyLinkSchema.safeParse({ kind: 'handbook', slug: 'travel-policy' }).success)
  assert.ok(academyLinkSchema.safeParse({ kind: 'handbook', slug: '' }).success)
  assert.ok(academyLinkSchema.safeParse({ kind: 'url', url: 'https://forms.gle/abc' }).success)
})

test('academyLinkSchema rejects unsafe links', () => {
  for (const bad of [
    { kind: 'url', url: 'javascript:alert(1)' },
    { kind: 'url', url: 'http://example.com' },
    { kind: 'url', url: 'not a url' },
    { kind: 'handbook', slug: '../admin' },
    { kind: 'handbook', slug: 'A/B' },
    { kind: 'other', url: 'https://x.test' },
  ]) {
    assert.equal(academyLinkSchema.safeParse(bad).success, false, JSON.stringify(bad))
  }
})

test('resolveAcademyLink resolves and re-validates', () => {
  assert.equal(resolveAcademyLink({ kind: 'handbook', slug: '' }), '/handbook')
  assert.equal(resolveAcademyLink({ kind: 'handbook', slug: 'leave' }), '/handbook/leave')
  assert.equal(resolveAcademyLink({ kind: 'url', url: 'https://forms.gle/abc' }), 'https://forms.gle/abc')
  assert.equal(resolveAcademyLink(null), null)
  assert.equal(resolveAcademyLink(undefined), null)
  assert.equal(resolveAcademyLink({ kind: 'url', url: 'javascript:alert(1)' } as never), null)
  assert.equal(resolveAcademyLink({ kind: 'handbook', slug: '../x' } as never), null)
  assert.equal(resolveAcademyLink('nope' as never), null)
})

test('sanitizeStoredLinks drops unknown keys and bad values', () => {
  const dropped: string[] = []
  const out = sanitizeStoredLinks(
    { TRAVEL_POLICY: { kind: 'handbook', slug: 'travel' }, LEAVE_POLICY: { kind: 'url', url: 'http://x.test' }, BOGUS: { kind: 'handbook', slug: 'a' } },
    (key) => dropped.push(key),
  )
  assert.deepEqual(out, { TRAVEL_POLICY: { kind: 'handbook', slug: 'travel' } })
  assert.deepEqual(dropped.sort(), ['BOGUS', 'LEAVE_POLICY'])
  assert.deepEqual(sanitizeStoredLinks(null), {})
  assert.deepEqual(sanitizeStoredLinks('junk'), {})
  assert.deepEqual(sanitizeStoredLinks([1]), {})
})

test('academyConfigInputSchema validates the whole input', () => {
  assert.equal(ACADEMY_LINK_KEYS.length, 15)
  assert.ok(
    academyConfigInputSchema.safeParse({
      links: { TRAVEL_POLICY: { kind: 'handbook', slug: 'x' } },
      blockersCallCt: 'WED 07:00',
      retakeCooldownMinutes: 0,
      failAlertThreshold: 1,
    }).success,
  )
  for (const bad of [
    { links: { NOT_A_KEY: { kind: 'handbook', slug: 'x' } } },
    { links: { TRAVEL_POLICY: { kind: 'url', url: 'http://x.test' } } },
    { invoiceTemplates: { Engineering: 'http://x.test/a' } },
    { invoiceTemplates: { Engineering: 'javascript:alert(1)' } },
    { retakeCooldownMinutes: -1 },
    { retakeCooldownMinutes: 1.5 },
    { failAlertThreshold: 0 },
    { blockersCallCt: 'whenever' },
  ]) {
    assert.equal(academyConfigInputSchema.safeParse(bad).success, false, JSON.stringify(bad))
  }
})

test('libraryCardSchema validates cards', () => {
  const ok = { kind: 'BENEFIT', title: 'Health cover', icon: 'HeartPulse', body: 'Details', links: [], countries: ['PK'], workModes: [], contractTypes: [], employmentStatuses: [] }
  assert.ok(libraryCardSchema.safeParse(ok).success)
  assert.equal(libraryCardSchema.safeParse({ ...ok, countries: ['pk'] }).success, false)
  assert.equal(libraryCardSchema.safeParse({ ...ok, icon: 'bad icon' }).success, false)
  assert.equal(libraryCardSchema.safeParse({ ...ok, title: '' }).success, false)
  const six = Array.from({ length: 6 }, () => ({ label: 'a', link: { kind: 'handbook', slug: '' } }))
  assert.equal(libraryCardSchema.safeParse({ ...ok, links: six }).success, false)
})

const icon = (() => null) as never
const adminConfig: SidebarConfig = {
  items: [{ label: 'Dashboard', href: '/admin', icon }],
  groups: [{ label: 'Onboarding', items: [{ label: 'Dashboard', href: '/admin/onboarding', icon }] }],
}
const onboardingConfig: SidebarConfig = { items: [{ label: 'Onboarding', href: '/onboarding', icon }], groups: [] }
const icons = { library: icon, contacts: icon, links: icon }

test('withAcademyNav adds three items to the admin Onboarding group only when enabled', () => {
  assert.equal(withAcademyNav(adminConfig, false, icons), adminConfig)
  const next = withAcademyNav(adminConfig, true, icons)
  assert.deepEqual(
    next.groups[0].items.map((i) => i.href),
    [
      '/admin/onboarding',
      '/admin/onboarding/academy/library',
      '/admin/onboarding/academy/contacts',
      '/admin/onboarding/academy/links',
    ],
  )
  assert.equal(withAcademyNav(next, true, icons).groups[0].items.length, 4)
  assert.equal(adminConfig.groups[0].items.length, 1)
})

test('withAcademyNav leaves non-admin sidebars alone', () => {
  assert.equal(withAcademyNav(onboardingConfig, true, icons), onboardingConfig)
})
