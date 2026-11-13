import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { ZodError } from 'zod'
import { prisma } from '../lib/db'
import {
  deactivateLibraryCard,
  eligibleCards,
  getAcademyConfig,
  listLibraryCards,
  saveKeyContacts,
  updateAcademyConfig,
  updateLibraryCard,
} from '../lib/academy/service/library'
import { ACADEMY_DB_TEST, P, resetAcademyFixtures } from './helpers/academy-test-db'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'

const card = (title: string, rules: Partial<Record<'countries' | 'workModes' | 'contractTypes' | 'employmentStatuses', string[]>> = {}) => ({
  kind: 'BENEFIT' as const,
  title,
  icon: 'Gift',
  body: 'ACT body',
  links: [],
  countries: [],
  workModes: [],
  contractTypes: [],
  employmentStatuses: [],
  ...rules,
})

async function seedCards() {
  await prisma.onboardingLibraryCard.deleteMany({ where: { body: 'ACT body' } })
  const rows = [
    card('ACT everyone'),
    card('ACT pk office', { countries: ['PK'], workModes: ['OFFICE'] }),
    card('ACT ma only', { countries: ['MA'] }),
  ]
  for (const [i, data] of rows.entries()) {
    await prisma.onboardingLibraryCard.create({ data: { ...data, countries: data.countries, workModes: data.workModes as never, contractTypes: data.contractTypes as never, employmentStatuses: data.employmentStatuses as never, orderIndex: i } })
  }
}

beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetAcademyFixtures(prisma)
  await prisma.user.create({ data: { ...P.hr, onboardingCompleted: true } })
  await prisma.user.create({ data: { ...P.staff, onboardingCompleted: true } })
  await seedCards()
  await prisma.onboardingConfig.deleteMany({ where: { id: 'singleton' } })
})
after(async () => {
  if (WEEKLY_DB_READY) {
    await resetAcademyFixtures(prisma)
    await prisma.onboardingLibraryCard.deleteMany({ where: { body: 'ACT body' } })
  }
  await prisma.$disconnect()
})

test('a hidden card can be unhidden with isActive alone, and nothing else changes', ACADEMY_DB_TEST, async () => {
  const row = await prisma.onboardingLibraryCard.findFirstOrThrow({ where: { title: 'ACT everyone' } })
  await deactivateLibraryCard(prisma, row.id)
  const updated = await updateLibraryCard(prisma, row.id, { isActive: true })
  assert.equal(updated.isActive, true)
  assert.equal(updated.title, row.title)
  assert.equal(updated.body, row.body)
})

test('an update with more than isActive still needs the whole card', ACADEMY_DB_TEST, async () => {
  const row = await prisma.onboardingLibraryCard.findFirstOrThrow({ where: { title: 'ACT everyone' } })
  await assert.rejects(updateLibraryCard(prisma, row.id, { isActive: true, title: 'ACT changed' }), ZodError)
})

test('a new card defaults to no eligibility rules', ACADEMY_DB_TEST, async () => {
  const created = await prisma.onboardingLibraryCard.create({
    data: { kind: 'BENEFIT', title: 'ACT defaults', icon: 'Gift', body: 'ACT body', orderIndex: 9000 },
  })
  assert.deepEqual(
    [created.countries, created.workModes, created.contractTypes, created.employmentStatuses],
    [[], [], [], []],
  )
})

const pkOffice = { officeLocation: 'KARACHI', remoteCountry: null, workMode: 'OFFICE', contractType: 'PK_EMPLOYMENT', employmentStatus: 'PERMANENT' } as const
const unset = { officeLocation: null, remoteCountry: null, workMode: null, contractType: null, employmentStatus: null } as const

test('eligibleCards includes matching cards and excludes other countries', ACADEMY_DB_TEST, async () => {
  const titles = (await eligibleCards(prisma, 'BENEFIT', pkOffice)).map((c) => c.title).filter((t) => t.startsWith('ACT'))
  assert.deepEqual(titles, ['ACT everyone', 'ACT pk office'])
})

test('eligibleCards with no attributes returns only unrestricted cards', ACADEMY_DB_TEST, async () => {
  const titles = (await eligibleCards(prisma, 'BENEFIT', unset)).map((c) => c.title).filter((t) => t.startsWith('ACT'))
  assert.deepEqual(titles, ['ACT everyone'])
})

test('soft-deleted cards are excluded unless asked for', ACADEMY_DB_TEST, async () => {
  await prisma.onboardingLibraryCard.updateMany({ where: { title: 'ACT everyone' }, data: { isActive: false } })
  const active = (await listLibraryCards(prisma, 'BENEFIT')).map((c) => c.title)
  assert.ok(!active.includes('ACT everyone'))
  assert.ok((await listLibraryCards(prisma, 'BENEFIT', { includeInactive: true })).some((c) => c.title === 'ACT everyone'))
  assert.ok(!(await eligibleCards(prisma, 'BENEFIT', pkOffice)).some((c) => c.title === 'ACT everyone'))
})

test('updateAcademyConfig rejects invalid input as a whole and persists nothing', ACADEMY_DB_TEST, async () => {
  await assert.rejects(
    updateAcademyConfig(prisma, { retakeCooldownMinutes: 30, links: { TRAVEL_POLICY: { kind: 'url', url: 'javascript:alert(1)' } } }),
    ZodError,
  )
  await assert.rejects(updateAcademyConfig(prisma, { links: { NOT_A_KEY: { kind: 'handbook', slug: 'x' } } }), ZodError)
  assert.equal(await prisma.onboardingConfig.count({ where: { id: 'singleton' } }), 0)
  assert.equal((await getAcademyConfig(prisma)).retakeCooldownMinutes, 15)
})

test('updateAcademyConfig saves and getAcademyConfig reads back', ACADEMY_DB_TEST, async () => {
  const view = await updateAcademyConfig(prisma, {
    links: { TRAVEL_POLICY: { kind: 'handbook', slug: 'travel' } },
    invoiceTemplates: { Engineering: 'https://example.test/inv' },
    blockersCallCt: 'thu 08:30',
    failAlertThreshold: 5,
  })
  assert.equal(view.blockersCallCt, 'THU 08:30')
  assert.equal(view.failAlertThreshold, 5)
  assert.deepEqual(view.links, { TRAVEL_POLICY: { kind: 'handbook', slug: 'travel' } })
  assert.equal((await getAcademyConfig(prisma)).invoiceTemplates.Engineering, 'https://example.test/inv')
})

test('getAcademyConfig tolerates a missing row and malformed stored JSON', ACADEMY_DB_TEST, async () => {
  const empty = await getAcademyConfig(prisma)
  assert.deepEqual(empty.links, {})
  assert.equal(empty.blockersCallCt, 'WED 07:00')
  await prisma.onboardingConfig.create({
    data: {
      id: 'singleton',
      links: { TRAVEL_POLICY: { kind: 'url', url: 'javascript:alert(1)' }, LEAVE_POLICY: { kind: 'handbook', slug: 'leave' }, BOGUS: 1 },
      invoiceTemplates: { Eng: 'http://insecure.test', Ops: 'https://ok.test/x', Bad: 5 },
    },
  })
  const view = await getAcademyConfig(prisma)
  assert.deepEqual(view.links, { LEAVE_POLICY: { kind: 'handbook', slug: 'leave' } })
  assert.deepEqual(view.invoiceTemplates, { Ops: 'https://ok.test/x' })
  await prisma.onboardingConfig.update({ where: { id: 'singleton' }, data: { links: 'junk', invoiceTemplates: [1] } })
  const junk = await getAcademyConfig(prisma)
  assert.deepEqual(junk.links, {})
  assert.deepEqual(junk.invoiceTemplates, {})
})

test('saveKeyContacts replaces the list in order and validates first', ACADEMY_DB_TEST, async () => {
  await saveKeyContacts(prisma, [
    { group: 'HR', userId: P.hr.id },
    { group: 'HR', label: 'ACT Front desk', email: 'act-desk@example.test' },
    { group: 'ACCOUNTS', userId: P.staff.id },
  ])
  const first = await prisma.onboardingKeyContact.findMany({ orderBy: [{ group: 'asc' }, { orderIndex: 'asc' }] })
  assert.equal(first.length, 3)
  await saveKeyContacts(prisma, [{ group: 'SECURITY_IT', label: 'ACT Desk', email: 'act-desk@example.test' }, { group: 'HR', userId: P.staff.id }])
  const second = await prisma.onboardingKeyContact.findMany({ orderBy: { orderIndex: 'asc' } })
  assert.deepEqual(second.map((c) => c.group), ['SECURITY_IT', 'HR'])
  assert.deepEqual(second.map((c) => c.orderIndex), [0, 1])
  await assert.rejects(saveKeyContacts(prisma, [{ group: 'HR' }]), ZodError)
  await assert.rejects(saveKeyContacts(prisma, [{ group: 'HR', userId: 'act-missing' }]), /not found|unknown/i)
  assert.equal(await prisma.onboardingKeyContact.count(), 2)
  await prisma.onboardingKeyContact.deleteMany({})
})
