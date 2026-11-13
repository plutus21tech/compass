import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { prisma } from '../lib/db'
import { AcademyError } from '../lib/academy/errors'
import { parseProgressState } from '../lib/academy/progress'
import { loadModule } from '../lib/academy/service/course'
import { completeModule, lockProgressRow, paymentFacts, recordEvent } from '../lib/academy/service/progress'
import { ACADEMY_DB_TEST, P } from './helpers/academy-test-db'
import {
  CONTRACTOR_ATTRIBUTES, HIRE_ID, TUTORIALS, cleanCourse, createReadyHire, createReleasedHire, progressRow, scrollAndComplete,
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

const openEverything = () =>
  prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID, status: 'LOCKED' }, data: { status: 'IN_PROGRESS' } })

const state = async (slug: string) => parseProgressState((await progressRow(slug)).state)

test('two concurrent CHECK calls with different keys both persist', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await Promise.all([
    recordEvent(prisma, HIRE_ID, 'security', { type: 'CHECK', key: 'twofa-google', checked: true }),
    recordEvent(prisma, HIRE_ID, 'security', { type: 'CHECK', key: 'twofa-discord', checked: true }),
    recordEvent(prisma, HIRE_ID, 'security', { type: 'CHECK', key: 'device-password', checked: true }),
  ])
  assert.deepEqual((await state('security')).checks, { 'twofa-google': true, 'twofa-discord': true, 'device-password': true })
})

test('two concurrent completeModule calls complete once, unlock once, and neither throws', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await recordEvent(prisma, HIRE_ID, 'welcome', { type: 'SCROLLED_END' })
  const results = await Promise.all([completeModule(prisma, HIRE_ID, 'welcome'), completeModule(prisma, HIRE_ID, 'welcome')])
  assert.deepEqual(results.map((r) => r.alreadyCompleted).sort(), [false, true])
  assert.ok(results.every((r) => r.nextSlug === 'culture-values'))
  const row = await progressRow('welcome')
  assert.equal(row.status, 'COMPLETED')
  assert.ok(row.completedAt)
  assert.ok(row.versionId)
  assert.equal((await progressRow('culture-values')).status, 'IN_PROGRESS')
  assert.equal((await progressRow('team-contacts')).status, 'LOCKED')
})

test('completing with the rule unmet is 409 with the reason and the next stays LOCKED', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await assert.rejects(completeModule(prisma, HIRE_ID, 'welcome'), fails(409, /Read to the end of this page first\./))
  assert.equal((await progressRow('welcome')).status, 'IN_PROGRESS')
  assert.equal((await progressRow('culture-values')).status, 'LOCKED')
})

test('a LOCKED module refuses recordEvent and completeModule', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await assert.rejects(recordEvent(prisma, HIRE_ID, 'team-contacts', { type: 'SCROLLED_END' }), fails(403, /Complete Module 2 first/))
  await assert.rejects(completeModule(prisma, HIRE_ID, 'team-contacts'), fails(403, /Complete Module 2 first/))
  assert.equal((await progressRow('team-contacts')).state, null)
})

test('an early-unlocked row takes events and can be completed', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await prisma.onboardingProgress.updateMany({
    where: { userId: HIRE_ID, module: { slug: 'culture-values' } }, data: { unlockedEarlyById: P.hr.id },
  })
  await scrollAndComplete('culture-values')
  assert.equal((await progressRow('culture-values')).status, 'COMPLETED')
  assert.equal((await progressRow('team-contacts')).status, 'IN_PROGRESS')
})

test('completing does not lower a next row that is already further on', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await prisma.onboardingProgress.updateMany({
    where: { userId: HIRE_ID, module: { slug: 'culture-values' } }, data: { status: 'COMPLETED', completedAt: new Date() },
  })
  await scrollAndComplete('welcome')
  assert.equal((await progressRow('culture-values')).status, 'COMPLETED')
})

test('an unknown event key is 400 and writes nothing', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await assert.rejects(recordEvent(prisma, HIRE_ID, 'welcome', { type: 'CHECK', key: 'act-nope', checked: true }), fails(400))
  await assert.rejects(recordEvent(prisma, HIRE_ID, 'welcome', { type: 'LINK_OPENED', key: 'COMPANY_DASHBOARD' }), fails(400))
  assert.equal((await progressRow('welcome')).state, null)
})

test('a check key and a link key are not interchangeable', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await assert.rejects(recordEvent(prisma, HIRE_ID, 'company-dashboard', { type: 'CHECK', key: 'COMPANY_DASHBOARD', checked: true }), fails(400))
  await assert.rejects(recordEvent(prisma, HIRE_ID, 'team-contacts', { type: 'LINK_OPENED', key: 'buddy-hello' }), fails(400))
})

test('a key hidden by a condition is 400', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await assert.rejects(recordEvent(prisma, HIRE_ID, 'getting-paid', { type: 'CHECK', key: 'invoice-template', checked: true }), fails(400))
})

test('a tutorial key is valid only in the module with tutorials, and survives the lead reordering them', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  const key = `tutorial:${createHash('sha256').update(TUTORIALS[1].url).digest('hex').slice(0, 12)}`
  await assert.rejects(recordEvent(prisma, HIRE_ID, 'how-we-work', { type: 'LINK_OPENED', key }), fails(400))
  const view = await recordEvent(prisma, HIRE_ID, 'role-90-days', { type: 'LINK_OPENED', key })
  assert.equal(view.effectiveRule, 'ALL_LINKS_OPENED')
  assert.equal(view.completion.met, false)

  await prisma.teamLeadForm.updateMany({ where: { newHire: { userId: HIRE_ID } }, data: { tutorials: [...TUTORIALS].reverse() } })
  const opened = (await loadModule(prisma, HIRE_ID, 'role-90-days')).tutorials
  assert.deepEqual(opened.map((t) => [t.url, t.opened]), [[TUTORIALS[1].url, true], [TUTORIALS[0].url, false]])
})

test('module 4 completes only once every tutorial is opened', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  const { tutorials } = await loadModule(prisma, HIRE_ID, 'role-90-days')
  await recordEvent(prisma, HIRE_ID, 'role-90-days', { type: 'LINK_OPENED', key: tutorials[0].key })
  await assert.rejects(completeModule(prisma, HIRE_ID, 'role-90-days'), fails(409, /1 to go/))
  await recordEvent(prisma, HIRE_ID, 'role-90-days', { type: 'LINK_OPENED', key: tutorials[1].key })
  await completeModule(prisma, HIRE_ID, 'role-90-days')
  assert.equal((await progressRow('role-90-days')).status, 'COMPLETED')
})

test('a module whose new version drops the tutorial block can still be finished', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  const module = await prisma.onboardingModule.findUniqueOrThrow({ where: { slug: 'role-90-days' } })
  const v2 = await prisma.onboardingModuleVersion.create({
    data: { moduleId: module.id, version: 2, blocks: [{ type: 'richText', markdown: 'Shorter.' }] },
  })
  await prisma.onboardingModule.update({ where: { id: module.id }, data: { currentVersionId: v2.id } })
  await recordEvent(prisma, HIRE_ID, 'role-90-days', { type: 'SCROLLED_END' })
  await completeModule(prisma, HIRE_ID, 'role-90-days')
  assert.equal((await progressRow('role-90-days')).versionId, v2.id)
})

test('module 6 needs the saved Discord username, read fresh from the database', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  for (let i = 1; i <= 8; i += 1) {
    await recordEvent(prisma, HIRE_ID, 'discord', { type: 'CHECK', key: `discord-${i}`, checked: true })
  }
  await assert.rejects(completeModule(prisma, HIRE_ID, 'discord'), fails(409, /Discord username/))
  await prisma.user.update({ where: { id: HIRE_ID }, data: { discordUsername: 'cara#3' } })
  await completeModule(prisma, HIRE_ID, 'discord')
  assert.equal((await progressRow('discord')).status, 'COMPLETED')
})

test('module 7 needs the Security acknowledgement', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  for (const key of ['twofa-google', 'twofa-discord', 'device-password']) {
    await recordEvent(prisma, HIRE_ID, 'security', { type: 'CHECK', key, checked: true })
  }
  await assert.rejects(completeModule(prisma, HIRE_ID, 'security'), fails(409, /acknowledgement/))
  // The values acknowledgement is a different kind and must not count.
  await prisma.onboardingAcknowledgement.create({
    data: { userId: HIRE_ID, kind: 'VALUES_CODE_OF_CONDUCT', statementText: 'Values', typedName: P.hire.name },
  })
  await assert.rejects(completeModule(prisma, HIRE_ID, 'security'), fails(409, /acknowledgement/))
  await prisma.onboardingAcknowledgement.create({
    data: {
      userId: HIRE_ID, kind: 'SECURITY_SOPS', statementText: 'Signed', typedName: P.hire.name,
      moduleVersionId: (await prisma.onboardingModule.findUniqueOrThrow({ where: { slug: 'security' } })).currentVersionId,
    },
  })
  const view = await loadModule(prisma, HIRE_ID, 'security')
  assert.equal(view.securityAcknowledgement?.typedName, P.hire.name)
  await completeModule(prisma, HIRE_ID, 'security')
})

test('a contractor needs the payout row and the invoice tick for module 11', ACADEMY_DB_TEST, async () => {
  await createReleasedHire({ attributes: CONTRACTOR_ATTRIBUTES })
  await openEverything()
  assert.deepEqual(await paymentFacts(prisma, HIRE_ID), { kind: 'OTHER', payoutSaved: false })
  await recordEvent(prisma, HIRE_ID, 'getting-paid', { type: 'CHECK', key: 'invoice-template', checked: true })
  await assert.rejects(completeModule(prisma, HIRE_ID, 'getting-paid'), fails(409, /payout details/))
  await prisma.onboardingPaymentDetails.create({
    data: { userId: HIRE_ID, method: 'WISE', accountHolderName: 'enc', currency: 'USD' },
  })
  assert.deepEqual(await paymentFacts(prisma, HIRE_ID), { kind: 'OTHER', payoutSaved: true })
  await completeModule(prisma, HIRE_ID, 'getting-paid')
})

test('paymentFacts for a PK hire reads only the onboarding store', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  assert.deepEqual(await paymentFacts(prisma, HIRE_ID), { kind: 'PK', bankSaved: false })
  await prisma.payrollEmployeeProfile.create({ data: { userId: HIRE_ID, bankName: 'cipher', accountTitle: 'cipher' } })
  assert.deepEqual(await paymentFacts(prisma, HIRE_ID), { kind: 'PK', bankSaved: false })
  await prisma.onboardingPaymentDetails.create({ data: { userId: HIRE_ID, method: 'PK_BANK', iban: 'cipher' } })
  assert.deepEqual(await paymentFacts(prisma, HIRE_ID), { kind: 'PK', bankSaved: true })
})

test('a completed module ignores events and reports it is already complete', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await scrollAndComplete('welcome')
  const row = await progressRow('welcome')
  const view = await recordEvent(prisma, HIRE_ID, 'welcome', { type: 'SCROLLED_END' })
  assert.equal(view.status, 'COMPLETED')
  assert.deepEqual(await completeModule(prisma, HIRE_ID, 'welcome'), { nextSlug: 'culture-values', alreadyCompleted: true })
  assert.equal((await progressRow('welcome')).updatedAt.getTime(), row.updatedAt.getTime())
})

test('a module completes against the current version and pins it', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const module = await prisma.onboardingModule.findUniqueOrThrow({ where: { slug: 'welcome' } })
  await scrollAndComplete('welcome')
  assert.equal((await progressRow('welcome')).versionId, module.currentVersionId)
})

test('events and completion are refused for a hire who is not released, even with legacy rows', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const module = await prisma.onboardingModule.findUniqueOrThrow({ where: { slug: 'welcome' } })
  await prisma.onboardingProgress.create({
    data: { userId: HIRE_ID, moduleId: module.id, status: 'IN_PROGRESS', state: { checks: {}, linksOpenedAt: {}, scrolledToEnd: true } },
  })
  await assert.rejects(recordEvent(prisma, HIRE_ID, 'welcome', { type: 'SCROLLED_END' }), fails(404))
  await assert.rejects(completeModule(prisma, HIRE_ID, 'welcome'), fails(404))
})

test('an inactive module is 404 for events and completion', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await prisma.onboardingModule.update({ where: { slug: 'welcome' }, data: { isActive: false } })
  await assert.rejects(recordEvent(prisma, HIRE_ID, 'welcome', { type: 'SCROLLED_END' }), fails(404))
  await assert.rejects(completeModule(prisma, HIRE_ID, 'welcome'), fails(404))
})

test('lockProgressRow really holds the row until the transaction ends', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const module = await prisma.onboardingModule.findUniqueOrThrow({ where: { slug: 'welcome' } })
  const order: string[] = []
  let release = () => {}
  const held = new Promise<void>((resolve) => { release = resolve })
  let signalLocked = () => {}
  const locked = new Promise<void>((resolve) => { signalLocked = resolve })
  const first = prisma.$transaction(async (tx) => {
    const row = await lockProgressRow(tx, HIRE_ID, module.id)
    assert.equal(row.status, 'IN_PROGRESS')
    signalLocked()
    await held
    order.push('first done')
  })
  await locked
  const second = recordEvent(prisma, HIRE_ID, 'welcome', { type: 'SCROLLED_END' }).then(() => order.push('event done'))
  await new Promise((resolve) => setTimeout(resolve, 200))
  assert.deepEqual(order, [])
  release()
  await Promise.all([first, second])
  assert.deepEqual(order, ['first done', 'event done'])
})

test('lockProgressRow is 404 when the row is missing', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const module = await prisma.onboardingModule.findUniqueOrThrow({ where: { slug: 'welcome' } })
  await assert.rejects(prisma.$transaction((tx) => lockProgressRow(tx, HIRE_ID, module.id)), fails(404))
})

test('a contract type blanked after release cannot strand a hire on module 11', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  await prisma.user.update({ where: { id: HIRE_ID }, data: { contractType: null } })
  const view = await loadModule(prisma, HIRE_ID, 'getting-paid')
  assert.equal(view.progress.effectiveRule, 'SCROLL_END')
  await recordEvent(prisma, HIRE_ID, 'getting-paid', { type: 'SCROLLED_END' })
  await completeModule(prisma, HIRE_ID, 'getting-paid')
  assert.equal((await progressRow('getting-paid')).status, 'COMPLETED')
})

test('a later version dropping buddy-hello cannot strand a hire on module 3', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openEverything()
  const module = await prisma.onboardingModule.findUniqueOrThrow({ where: { slug: 'team-contacts' } })
  const v2 = await prisma.onboardingModuleVersion.create({
    data: { moduleId: module.id, version: 2, blocks: [{ type: 'richText', markdown: 'Say hello.' }] },
  })
  await prisma.onboardingModule.update({ where: { id: module.id }, data: { currentVersionId: v2.id } })
  await recordEvent(prisma, HIRE_ID, 'team-contacts', { type: 'SCROLLED_END' })
  await completeModule(prisma, HIRE_ID, 'team-contacts')
  assert.equal((await progressRow('team-contacts')).status, 'COMPLETED')
})
