import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { AcademyError } from '../lib/academy/errors'
import { buildAcademyContext } from '../lib/academy/service/context'
import { loadHome, loadModule, recomputeDueDates, releaseCourse } from '../lib/academy/service/course'
import { completeModule, recomputeDueDatesForHire, recordEvent } from '../lib/academy/service/progress'
import { loadSetup, saveSetup } from '../lib/academy/service/setup'
import type { Block } from '../lib/academy/blocks'
import { ACADEMY_DB_TEST, P } from './helpers/academy-test-db'
import {
  CONTRACTOR_ATTRIBUTES, HIRE_ID, NEW_HIRE_ID, SLUGS, TUTORIALS, cleanCourse, createReadyHire, createReleasedHire,
  progressRow, scrollAndComplete, setupBody,
} from './helpers/academy-course-fixtures'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'

const fails = (status: number, message?: RegExp) => (error: unknown) => {
  assert.ok(error instanceof AcademyError, String(error))
  assert.equal(error.status, status)
  if (message) assert.match(error.message, message)
  return true
}

after(async () => {
  if (WEEKLY_DB_READY) await cleanCourse()
  await prisma.$disconnect()
})

const allStrings = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(allStrings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(allStrings)
  return []
}

/** The Need/Contact table on Module 3. */
const contactCells = (blocks: Block[]) => {
  const table = blocks.find((b) => b.type === 'dataTable')
  assert.ok(table?.type === 'dataTable')
  return table.rows.map((row) => row[1])
}

const openEverything = () =>
  prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID, status: 'LOCKED' }, data: { status: 'IN_PROGRESS' } })

test('release without the optional setup goes ahead', ACADEMY_DB_TEST, async () => {
  await createReadyHire({ coreHoursStart: '', coreHoursEnd: '', buddyId: '', teamLeadId: '', hrCallAt: '' })
  const { releasedAt } = await releaseCourse(prisma, NEW_HIRE_ID, P.hr.id)
  assert.ok(releasedAt)
})

test('release with a missing required field is 409 and names it', ACADEMY_DB_TEST, async () => {
  await createReadyHire({ attributes: { officeLocation: 'KARACHI', workMode: null, contractType: 'PK_EMPLOYMENT', employmentStatus: 'PERMANENT' } })
  await assert.rejects(releaseCourse(prisma, NEW_HIRE_ID, P.hr.id), fails(409, /Work mode/))
  const hire = await prisma.newHire.findUniqueOrThrow({ where: { id: NEW_HIRE_ID } })
  assert.equal(hire.academyReleasedAt, null)
  assert.equal(await prisma.onboardingProgress.count({ where: { userId: HIRE_ID } }), 0)
})

test('release of an unknown hire is 404', ACADEMY_DB_TEST, async () => {
  await assert.rejects(releaseCourse(prisma, 'act-nobody', P.hr.id), fails(404))
})

test('release creates 14 rows with module 1 available and due dates, and a second release changes nothing', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const { releasedAt } = await releaseCourse(prisma, NEW_HIRE_ID, P.hr.id)
  const read = () =>
    prisma.onboardingProgress.findMany({
      where: { userId: HIRE_ID },
      include: { module: true },
      orderBy: { module: { orderIndex: 'asc' } },
    })
  const rows = await read()
  assert.equal(rows.length, 14)
  assert.deepEqual(rows.map((r) => r.module.slug), SLUGS)
  assert.equal(rows[0].status, 'IN_PROGRESS')
  assert.equal(rows[0].startedAt, null)
  assert.ok(rows.slice(1).every((r) => r.status === 'LOCKED'))
  assert.ok(rows.every((r) => r.source === 'COURSE'))
  // Tuesday 1 Dec 2026 in Karachi (UTC+5): Day 1 ends that night, Week 1 five working days later.
  assert.equal(rows[0].dueAt?.toISOString(), '2026-12-01T18:59:59.999Z')
  assert.equal(rows[13].dueAt?.toISOString(), '2026-12-08T18:59:59.999Z')

  const again = await releaseCourse(prisma, NEW_HIRE_ID, P.hr.id)
  assert.equal(again.releasedAt.getTime(), releasedAt.getTime())
  assert.deepEqual((await read()).map((r) => r.updatedAt.getTime()), rows.map((r) => r.updatedAt.getTime()))
})

test('a second release keeps progress the hire already made', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await scrollAndComplete('welcome')
  await releaseCourse(prisma, NEW_HIRE_ID, P.hr.id)
  assert.equal((await progressRow('welcome')).status, 'COMPLETED')
  assert.equal((await progressRow('culture-values')).status, 'IN_PROGRESS')
})

test('two concurrent releases give one release', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const [a, b] = await Promise.all([releaseCourse(prisma, NEW_HIRE_ID, P.hr.id), releaseCourse(prisma, NEW_HIRE_ID, P.hr.id)])
  assert.equal(a.releasedAt.getTime(), b.releasedAt.getTime())
  assert.equal(await prisma.onboardingProgress.count({ where: { userId: HIRE_ID } }), 14)
})

test('release corrects rows the legacy path created', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const modules = await prisma.onboardingModule.findMany({ where: { slug: { in: SLUGS } }, orderBy: { orderIndex: 'asc' } })
  const stale = new Date('2026-11-01T00:00:00.000Z')
  await prisma.onboardingProgress.createMany({
    data: modules.map((m, i) => ({
      userId: HIRE_ID, moduleId: m.id,
      status: i === 0 ? ('COMPLETED' as const) : i === 1 ? ('IN_PROGRESS' as const) : ('LOCKED' as const),
      startedAt: i < 2 ? stale : null, completedAt: i === 0 ? stale : null,
    })),
  })
  await releaseCourse(prisma, NEW_HIRE_ID, P.hr.id)
  const first = await progressRow('welcome')
  assert.equal(first.status, 'IN_PROGRESS')
  assert.equal(first.startedAt, null)
  assert.equal(first.completedAt, null)
  assert.ok(first.dueAt)
  const second = await progressRow('culture-values')
  assert.equal(second.status, 'LOCKED')
  assert.equal(second.startedAt, null)
})

test('release with only 3 active modules is 409', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await prisma.onboardingModule.updateMany({ where: { slug: { in: SLUGS.slice(3) } }, data: { isActive: false } })
  await assert.rejects(releaseCourse(prisma, NEW_HIRE_ID, P.hr.id), fails(409, /The Academy content hasn't been loaded yet\./))
  assert.equal(await prisma.onboardingProgress.count({ where: { userId: HIRE_ID } }), 0)
})

test('a module with no current version does not count towards the 14', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await prisma.onboardingModule.update({ where: { slug: 'welcome' }, data: { currentVersionId: null } })
  await assert.rejects(releaseCourse(prisma, NEW_HIRE_ID, P.hr.id), fails(409, /hasn't been loaded/))
})

test('due dates skip holidays for the hire team and everyone, not other teams', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await prisma.payrollPublicHoliday.createMany({
    data: [
      { id: 'act-h1', holidayDate: new Date('2026-12-03T00:00:00.000Z'), name: 'ACT Pakistan day', teamTags: ['PAKISTAN'] },
      { id: 'act-h2', holidayDate: new Date('2026-12-04T00:00:00.000Z'), name: 'ACT Company day', teamTags: [] },
      { id: 'act-h3', holidayDate: new Date('2026-12-07T00:00:00.000Z'), name: 'ACT Morocco day', teamTags: ['MOROCCO'] },
    ],
  })
  await releaseCourse(prisma, NEW_HIRE_ID, P.hr.id)
  assert.equal((await progressRow('company-dashboard')).dueAt?.toISOString(), '2026-12-10T18:59:59.999Z')
})

test('with no holiday team only weekends are skipped', ACADEMY_DB_TEST, async () => {
  await createReadyHire({ attributes: CONTRACTOR_ATTRIBUTES })
  await prisma.payrollPublicHoliday.create({
    data: { id: 'act-h1', holidayDate: new Date('2026-12-03T00:00:00.000Z'), name: 'ACT Company day', teamTags: [] },
  })
  await releaseCourse(prisma, NEW_HIRE_ID, P.hr.id)
  // Jakarta is UTC+7.
  assert.equal((await progressRow('company-dashboard')).dueAt?.toISOString(), '2026-12-08T16:59:59.999Z')
})

test('moving the joining date changes incomplete due dates and not completed ones', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await scrollAndComplete('welcome')
  const completedDue = (await progressRow('welcome')).dueAt
  await saveSetup(prisma, NEW_HIRE_ID, setupBody({ onboardingDate: '2026-12-08' }), P.hr.id)
  assert.equal((await progressRow('welcome')).dueAt?.getTime(), completedDue?.getTime())
  assert.equal((await progressRow('culture-values')).dueAt?.toISOString(), '2026-12-08T18:59:59.999Z')
  assert.equal((await progressRow('company-dashboard')).dueAt?.toISOString(), '2026-12-15T18:59:59.999Z')
})

test('saving setup with the same joining date touches no due date', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const before = await progressRow('culture-values')
  await saveSetup(prisma, NEW_HIRE_ID, setupBody({ department: 'Equity' }), P.hr.id)
  assert.equal((await progressRow('culture-values')).updatedAt.getTime(), before.updatedAt.getTime())
})

test('recomputeDueDates counts only the rows it changed, and is 0 before release', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  assert.equal(await recomputeDueDates(prisma, HIRE_ID), 0)
  await releaseCourse(prisma, NEW_HIRE_ID, P.hr.id)
  assert.equal(await recomputeDueDates(prisma, HIRE_ID), 0)
  await prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID, module: { slug: 'welcome' } }, data: { dueAt: null } })
  assert.equal(await recomputeDueDates(prisma, HIRE_ID), 1)
})

test('context is null without a released hire, and loadHome says not released', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  assert.equal(await buildAcademyContext(prisma, HIRE_ID), null)
  assert.equal(await buildAcademyContext(prisma, P.staff.id), null)
  assert.deepEqual(await loadHome(prisma, HIRE_ID), { released: false })
  assert.deepEqual(await loadHome(prisma, P.staff.id), { released: false })
})

test('loadModule refuses a hire who has legacy rows but no release', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const module = await prisma.onboardingModule.findUniqueOrThrow({ where: { slug: 'welcome' } })
  await prisma.onboardingProgress.create({ data: { userId: HIRE_ID, moduleId: module.id, status: 'IN_PROGRESS' } })
  await assert.rejects(loadModule(prisma, HIRE_ID, 'welcome'), fails(404))
})

test('loadModule: LOCKED is 403 naming the module before, early unlock opens it, inactive and no row are 404', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await assert.rejects(loadModule(prisma, HIRE_ID, 'team-contacts'), fails(403, /Complete Module 2 first/))
  await assert.rejects(loadModule(prisma, HIRE_ID, 'act-unknown'), fails(404))

  await prisma.onboardingProgress.updateMany({
    where: { userId: HIRE_ID, module: { slug: 'team-contacts' } }, data: { unlockedEarlyById: P.hr.id },
  })
  const early = await loadModule(prisma, HIRE_ID, 'team-contacts')
  assert.equal(early.number, 3)
  assert.equal(early.progress.status, 'IN_PROGRESS')

  await prisma.onboardingProgress.deleteMany({ where: { userId: HIRE_ID, module: { slug: 'discord' } } })
  await assert.rejects(loadModule(prisma, HIRE_ID, 'discord'), fails(404))

  await prisma.onboardingModule.update({ where: { slug: 'welcome' }, data: { isActive: false } })
  await assert.rejects(loadModule(prisma, HIRE_ID, 'welcome'), fails(404))
})

test('loadModule sets startedAt once', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const first = await loadModule(prisma, HIRE_ID, 'welcome')
  assert.equal(first.progress.status, 'IN_PROGRESS')
  const startedAt = (await progressRow('welcome')).startedAt
  assert.ok(startedAt)
  await loadModule(prisma, HIRE_ID, 'welcome')
  assert.equal((await progressRow('welcome')).startedAt?.getTime(), startedAt.getTime())
})

test('after a new version, a completed module loads version 1 and an open one loads version 2', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await scrollAndComplete('welcome')
  for (const slug of ['welcome', 'culture-values']) {
    const module = await prisma.onboardingModule.findUniqueOrThrow({ where: { slug } })
    const v2 = await prisma.onboardingModuleVersion.create({
      data: { moduleId: module.id, version: 2, blocks: [{ type: 'richText', markdown: 'Version two for {preferred name}.' }] },
    })
    await prisma.onboardingModule.update({ where: { id: module.id }, data: { currentVersionId: v2.id } })
  }
  const done = await loadModule(prisma, HIRE_ID, 'welcome')
  assert.equal(done.blocks[0].type, 'video')
  const open = await loadModule(prisma, HIRE_ID, 'culture-values')
  assert.deepEqual(open.blocks, [{ type: 'richText', markdown: 'Version two for Cara.' }])
})

test('no tutorials and no key contacts: modules 3 and 4 load, module 4 completes by SCROLL_END, no braces', ACADEMY_DB_TEST, async () => {
  await createReleasedHire({}, { tutorials: [], teamTools: [] })
  await scrollAndComplete('welcome')
  await scrollAndComplete('culture-values')
  const three = await loadModule(prisma, HIRE_ID, 'team-contacts')
  assert.deepEqual(three.keyContacts.HR, [])
  assert.ok(allStrings(three.blocks).every((text) => !text.includes('{')))
  assert.deepEqual(contactCells(three.blocks), ['Security and IT', 'Accounts, acct@plutus21.com'])
  await recordEvent(prisma, HIRE_ID, 'team-contacts', { type: 'CHECK', key: 'buddy-hello', checked: true })
  await completeModule(prisma, HIRE_ID, 'team-contacts')

  const four = await loadModule(prisma, HIRE_ID, 'role-90-days')
  assert.equal(four.progress.effectiveRule, 'SCROLL_END')
  assert.deepEqual(four.tutorials, [])
  assert.ok(allStrings(four.blocks).every((text) => !text.includes('{')))
  await assert.rejects(completeModule(prisma, HIRE_ID, 'role-90-days'), fails(409, /Read to the end/))
  await recordEvent(prisma, HIRE_ID, 'role-90-days', { type: 'SCROLLED_END' })
  assert.deepEqual(await completeModule(prisma, HIRE_ID, 'role-90-days'), { nextSlug: 'how-we-work', alreadyCompleted: false })
})

test('the module view carries everything rendered and resolved', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await prisma.user.update({ where: { id: P.lead.id }, data: { position: 'Head of Research', discordUsername: 'layla#1' } })
  await prisma.onboardingConfig.update({
    where: { id: 'singleton' },
    data: { invoiceTemplates: { Research: 'https://example.test/invoice' } },
  })
  await prisma.onboardingKeyContact.createMany({
    data: [
      { id: 'act-c1', group: 'SECURITY_IT', userId: P.staff.id, orderIndex: 0 },
      { id: 'act-c2', group: 'ACCOUNTS', label: 'Accounts desk', email: 'desk@example.test', orderIndex: 1 },
    ],
  })
  await openEverything()

  const three = await loadModule(prisma, HIRE_ID, 'team-contacts')
  assert.equal(three.number, 3)
  assert.equal(three.total, 14)
  assert.equal(three.title, 'Your Team and Key Contacts')
  assert.deepEqual([three.headlineLead, three.headlineAccent], ['MEET YOUR', 'Team'])
  assert.equal(three.estimatedMinutes, 5)
  assert.equal(three.phase, 'DAY_1')
  assert.equal(three.nextSlug, 'role-90-days')
  assert.equal(three.rail.length, 14)
  assert.equal(three.lead?.title, 'Head of Research')
  assert.equal(three.lead?.discordUsername, 'layla#1')
  assert.deepEqual(three.team.map((p) => p.name), [P.staff.name])
  assert.equal(three.buddy?.name, P.buddy.name)
  assert.equal(three.keyContacts.ACCOUNTS[0].name, 'Accounts desk')
  assert.equal(three.keyContacts.ACCOUNTS[0].email, 'desk@example.test')
  assert.deepEqual(contactCells(three.blocks), [`${P.staff.name} (${P.staff.email})`, 'Accounts desk (desk@example.test), acct@plutus21.com'])
  assert.equal(three.invoiceTemplateHref, 'https://example.test/invoice')

  const four = await loadModule(prisma, HIRE_ID, 'role-90-days')
  assert.deepEqual(four.tutorials.map((t) => [t.title, t.url, t.opened]), TUTORIALS.map((t) => [t.title, t.url, false]))
  assert.ok(four.tutorials.every((t) => /^tutorial:[0-9a-f]{12}$/.test(t.key)))
  assert.equal(four.roleExpectations, 'Own the weekly research note.')
  assert.equal(four.teamTools[0].name, 'Tableau')
  assert.equal(four.callTimes.hrCallAt, '2026-11-25T09:00:00.000Z')
  assert.ok(allStrings(four.blocks).some((t) => t.includes('Say hello.')))
  assert.ok(allStrings(four.blocks).some((t) => t.includes('with Layla.')))

  const dashboard = await loadModule(prisma, HIRE_ID, 'company-dashboard')
  assert.equal(dashboard.links.COMPANY_DASHBOARD, '/handbook')
  assert.equal(dashboard.links.INCIDENT_FORM, undefined)
  assert.equal(dashboard.nextSlug, null)
  assert.equal(dashboard.progress.effectiveRule, 'LINK_OPENED')
})

test('a hire with no template for their department gets null, and a blank dashboard link falls back', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await prisma.onboardingConfig.update({ where: { id: 'singleton' }, data: { links: {} } })
  const view = await loadModule(prisma, HIRE_ID, 'company-dashboard')
  assert.equal(view.invoiceTemplateHref, null)
  assert.deepEqual(view.links, {})
  assert.equal(view.progress.effectiveRule, 'SCROLL_END')
  await recordEvent(prisma, HIRE_ID, 'company-dashboard', { type: 'SCROLLED_END' })
  await completeModule(prisma, HIRE_ID, 'company-dashboard')
})

test('commute table: tiers in effect today, a split card body, and the fallback message', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  // The test database's migrations seed real tiers: park them so this test owns the table.
  const seeded = await prisma.payrollTravelAllowanceTier.findMany({ where: { isActive: true }, select: { id: true } })
  await prisma.payrollTravelAllowanceTier.updateMany({ where: { id: { in: seeded.map((t) => t.id) } }, data: { isActive: false } })
  try {
    const empty = await loadModule(prisma, HIRE_ID, 'reimbursements')
    assert.deepEqual(empty.commute, { rows: [], emptyMessage: 'Ask HR for the current rates.' })
    const card = empty.library.REIMBURSEMENT.find((c) => c.title === 'Commute')
    assert.deepEqual(card?.parts.map((p) => p.kind), ['text', 'commuteTable'])

    const day = 86_400_000
    await prisma.payrollTravelAllowanceTier.createMany({
      data: [
        { id: 'act-t1', transportMode: 'CAR', minKm: 0, maxKm: 10, monthlyRate: 5000, effectiveFrom: new Date(Date.now() - day) },
        { id: 'act-t2', transportMode: 'CAR', minKm: 10, maxKm: null, monthlyRate: 9000, effectiveFrom: new Date(Date.now() + day) },
        { id: 'act-t3', transportMode: 'CAR', minKm: 20, maxKm: null, monthlyRate: 7000, effectiveFrom: new Date(Date.now() - 3 * day), effectiveTo: new Date(Date.now() - 2 * day) },
        { id: 'act-t4', transportMode: 'CAR', minKm: 30, maxKm: null, monthlyRate: 8000, effectiveFrom: new Date(Date.now() - day), isActive: false },
      ],
    })
    const loaded = await loadModule(prisma, HIRE_ID, 'reimbursements')
    assert.deepEqual(loaded.commute.rows, [{ transportMode: 'CAR', minKm: 0, maxKm: 10, monthlyRate: 5000 }])
  } finally {
    await prisma.payrollTravelAllowanceTier.updateMany({ where: { id: { in: seeded.map((t) => t.id) } }, data: { isActive: true } })
  }
})

test('library cards resolve config links and hide ones with no target', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  const view = await loadModule(prisma, HIRE_ID, 'your-benefits')
  assert.ok(view.library.BENEFIT.length > 0)
  const health = view.library.BENEFIT.find((c) => c.title === 'Health insurance')
  assert.deepEqual(health?.links, [])
  const reimbursement = await loadModule(prisma, HIRE_ID, 'reimbursements')
  const travel = reimbursement.library.REIMBURSEMENT.find((c) => c.title === 'Work travel')
  assert.deepEqual(travel?.links, [{ label: 'Travel Policy', href: '/handbook/travel-policy' }])
})

test('no view holds bank or payout values, only whether they are saved', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await prisma.onboardingPaymentDetails.create({
    data: { userId: HIRE_ID, method: 'PK_BANK', iban: 'ACT-SECRET-IBAN', bankName: 'ACT-SECRET-BANK', branch: 'ACT-SECRET-BRANCH', accountTitle: 'ACT-SECRET-TITLE' },
  })
  const view = await loadModule(prisma, HIRE_ID, 'getting-paid')
  assert.equal(view.bankSaved, true)
  assert.equal(view.payoutSaved, false)
  assert.doesNotMatch(JSON.stringify(view), /ACT-SECRET/)
  assert.doesNotMatch(JSON.stringify(await loadHome(prisma, HIRE_ID)), /ACT-SECRET/)
})

test('views are JSON-safe', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const module = await loadModule(prisma, HIRE_ID, 'welcome')
  const home = await loadHome(prisma, HIRE_ID)
  assert.deepEqual(JSON.parse(JSON.stringify(module)), module)
  assert.deepEqual(JSON.parse(JSON.stringify(home)), home)
})

test('home holds the greeting, counts, next module, calls, buddy and phases', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await prisma.user.update({ where: { id: P.buddy.id }, data: { discordUsername: 'ben#2' } })
  await scrollAndComplete('welcome')
  const home = await loadHome(prisma, HIRE_ID)
  assert.ok(home.released)
  assert.equal(home.greeting, 'WELCOME TO THE TEAM, Cara')
  assert.equal(home.title, 'Analyst')
  assert.equal(home.department, 'Research')
  assert.equal(home.doneCount, 1)
  assert.equal(home.total, 14)
  assert.equal(home.courseDueAt, '2026-12-08T18:59:59.999Z')
  assert.equal(home.nextModule?.slug, 'culture-values')
  assert.equal(home.nextModule?.status, 'AVAILABLE')
  assert.equal(home.yourBuddy?.discordUsername, 'ben#2')
  assert.equal(home.yourCalls.hrCallAt, '2026-11-25T09:00:00.000Z')
  assert.equal(home.yourCalls.teamCallAt, '2026-11-26T09:00:00.000Z')
  assert.deepEqual(home.phases.map((p) => [p.phase, p.modules.length]), [['DAY_1', 7], ['WEEK_1', 7]])
  assert.equal(home.phases[0].modules[0].status, 'COMPLETED')
  assert.ok(home.phases[0].modules[0].completedAt)
  assert.equal(home.phases[1].modules[0].status, 'LOCKED')
})

test('home has no next module when everything is done', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID }, data: { status: 'COMPLETED', completedAt: new Date() } })
  const home = await loadHome(prisma, HIRE_ID)
  assert.ok(home.released)
  assert.equal(home.doneCount, 14)
  assert.equal(home.nextModule, null)
})

test('a joining date moved during release still lands on every row', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await Promise.all([
    saveSetup(prisma, NEW_HIRE_ID, setupBody({ onboardingDate: '2026-12-08' }), P.hr.id),
    releaseCourse(prisma, NEW_HIRE_ID, P.hr.id),
  ])
  assert.equal((await progressRow('culture-values')).dueAt?.toISOString(), '2026-12-08T18:59:59.999Z')
})

test('loadSetup reports when the course was released', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  assert.equal((await loadSetup(prisma, NEW_HIRE_ID)).releasedAt, null)
  const { releasedAt } = await releaseCourse(prisma, NEW_HIRE_ID, P.hr.id)
  assert.equal((await loadSetup(prisma, NEW_HIRE_ID)).releasedAt?.getTime(), releasedAt.getTime())
})

test('module 11 tells a PK hire where to go with the letter, with no blank where a bank name was', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  const view = await loadModule(prisma, HIRE_ID, 'getting-paid')
  const steps = allStrings(view.blocks).find((text) => text.includes('Open your salary account'))
  assert.ok(steps?.includes('2. **Open your salary account** using the letter.'), steps)
  assert.ok(allStrings(view.blocks).every((text) => !text.includes('{') && !/\S  \S/.test(text)))
})

test('a joining date written by the older new-hire route reaches a released hire, and only incomplete rows', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await scrollAndComplete('welcome')
  const completedDue = (await progressRow('welcome')).dueAt
  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { onboardingDate: new Date('2026-12-08T00:00:00.000Z') } })
  assert.equal(await recomputeDueDatesForHire(prisma, NEW_HIRE_ID), 13)
  assert.equal((await progressRow('welcome')).dueAt?.getTime(), completedDue?.getTime())
  assert.equal((await progressRow('culture-values')).dueAt?.toISOString(), '2026-12-08T18:59:59.999Z')
  assert.equal(await recomputeDueDatesForHire(prisma, NEW_HIRE_ID), 0)
})

test('recomputeDueDatesForHire does nothing for an unknown, unlinked or unreleased hire', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  assert.equal(await recomputeDueDatesForHire(prisma, 'act-nobody'), 0)
  assert.equal(await recomputeDueDatesForHire(prisma, NEW_HIRE_ID), 0)
  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { userId: null, academyReleasedAt: new Date() } })
  assert.equal(await recomputeDueDatesForHire(prisma, NEW_HIRE_ID), 0)
})
