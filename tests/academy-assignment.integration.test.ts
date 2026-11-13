import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { Prisma } from '@prisma/client'
import { prisma } from '../lib/db'
import { BANK_LOCKED_MESSAGE } from '../lib/academy/bank'
import { shouldBlockSession } from '../lib/academy/lockout'
import { assignModule, listAssignable, loadAssigned, notifyAssigned, requestReread } from '../lib/academy/service/assignment'
import { finishCourseIfDone, loadCompletion, signValuesAcknowledgement } from '../lib/academy/service/completion'
import { buildAcademyContext } from '../lib/academy/service/context'
import { loadHome, loadModule } from '../lib/academy/service/course'
import { saveBankDetails, saveDiscordUsername, saveLinkedinUrl, signAcknowledgement } from '../lib/academy/service/fields'
import { savePayout } from '../lib/academy/service/payout'
import { completeModule, isCourseModule, readCourseProgress, recomputeDueDates, recordEvent, versionIdFor } from '../lib/academy/service/progress'
import { loadQuiz, lockUserRow } from '../lib/academy/service/quiz'
import { runOnboardingJob, type ReminderSenders } from '../lib/academy/service/reminders'
import { loadTracker } from '../lib/academy/service/tracker'
import { ACADEMY_DB_TEST, P } from './helpers/academy-test-db'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'
import {
  CONTRACTOR_ATTRIBUTES,
  HIRE_ID,
  NEW_HIRE_ID,
  SLUGS,
  cleanCourse,
  createReadyHire,
  createReleasedHire,
  progressRow,
  scrollAndComplete,
} from './helpers/academy-course-fixtures'

process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

const STAFF = P.staff.id
const SECURITY = 'security'
const HR = { id: P.hr.id, role: 'HR' }
const BANK = { accountTitle: 'Ana Torvik', bankName: 'Example Bank', branch: 'Main Branch', iban: 'pk36 scbl 0000 0011 2345 6702' }
const WISE = { method: 'WISE', accountHolderName: 'Ana Torvik', payoutEmail: 'ana@example.test', currency: 'USD' }

const LINKEDIN = 'https://www.linkedin.com/in/fictional-person'
const DAY_ONE = new Date('2026-12-01T09:00:00.000Z')
const DAY_TWO = new Date('2026-12-02T09:00:00.000Z')

const fails = (status: number, message?: string) => (error: unknown) => {
  const { status: actual, message: text } = error as { status?: number; message?: string }
  return actual === status && (message === undefined || text === message)
}
const READING_ONLY = fails(403, 'This module is for reading only.')

const moduleBySlug = (slug: string) => prisma.onboardingModule.findUniqueOrThrow({ where: { slug } })
const moduleIdOf = async (slug: string): Promise<string> => (await moduleBySlug(slug)).id
const rowOf = (userId: string, slug: string) => prisma.onboardingProgress.findFirst({ where: { userId, module: { slug } } })
const isFinished = async (userId: string) => (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).onboardingCompleted
const trackedDone = async () => (await loadTracker(prisma, HR, {})).find((r) => r.newHireId === NEW_HIRE_ID)?.modulesDone

/** Publishes the module's current blocks again, as the next version. */
async function publishNewVersion(slug: string) {
  const module = await moduleBySlug(slug)
  const current = await prisma.onboardingModuleVersion.findUniqueOrThrow({ where: { id: module.currentVersionId ?? '' } })
  const next = await prisma.onboardingModuleVersion.create({
    data: { moduleId: module.id, version: current.version + 1, blocks: current.blocks as Prisma.InputJsonValue, changeNote: 'Fictional change' },
  })
  await prisma.onboardingModule.update({ where: { id: module.id }, data: { currentVersionId: next.id } })
  return next
}

async function finishWholeCourse(userId: string): Promise<void> {
  const rows = await prisma.onboardingProgress.findMany({ where: { userId }, include: { module: true } })
  for (const row of rows) {
    await prisma.onboardingProgress.update({
      where: { id: row.id },
      data: {
        status: 'COMPLETED',
        versionId: row.module.currentVersionId,
        startedAt: new Date('2026-12-01T00:00:00.000Z'),
        completedAt: new Date('2026-12-05T00:00:00.000Z'),
      },
    })
  }
}

async function finishHire(): Promise<void> {
  await finishWholeCourse(HIRE_ID)
  await prisma.user.update({ where: { id: HIRE_ID }, data: { onboardingCompleted: true } })
  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { status: 'COMPLETED' } })
  await prisma.onboardingAcknowledgement.create({
    data: { userId: HIRE_ID, kind: 'VALUES_CODE_OF_CONDUCT', statementText: 'Fictional', typedName: P.hire.name },
  })
}

/** Does whatever the person's own page asks for, the way the page itself would. */
async function completeAsThePageWould(userId: string, name: string, slug: string): Promise<void> {
  const view = await loadModule(prisma, userId, slug)
  for (const block of view.blocks) {
    if (block.type === 'checklist') {
      for (const item of block.items) await recordEvent(prisma, userId, slug, { type: 'CHECK', key: item.key, checked: true })
    }
    if (block.type === 'dashboardLink') await recordEvent(prisma, userId, slug, { type: 'LINK_OPENED', key: 'COMPANY_DASHBOARD' })
    if (block.type === 'acknowledgement') await signAcknowledgement(prisma, userId, { kind: 'SECURITY_SOPS', typedName: name, moduleSlug: slug })
    if (block.type === 'inputField' && block.target === 'discordUsername') await saveDiscordUsername(prisma, userId, 'fictional.person')
  }
  await recordEvent(prisma, userId, slug, { type: 'SCROLLED_END' })
  await completeModule(prisma, userId, slug)
}

let pending: Promise<unknown> = Promise.resolve()

const clearNoticeLog = () => prisma.onboardingNotificationLog.deleteMany({ where: { key: { startsWith: 'assign:act-' } } })

const markInactive = (userId: string) => prisma.payrollEmployeeProfile.create({ data: { userId, isPayrollActive: false } })

interface SentNotice { to: string; name: string; title: string; slug: string; inCourse: boolean }

function recorder(failFor: (to: string) => boolean = () => false) {
  const calls: SentNotice[] = []
  const send = async (input: SentNotice) => {
    calls.push(input)
    return { success: !failFor(input.to) }
  }
  return { calls, send }
}

beforeEach(async () => {
  if (WEEKLY_DB_READY) await clearNoticeLog()
})

after(async () => {
  if (WEEKLY_DB_READY) {
    await prisma.onboardingNotificationLog.deleteMany({ where: { key: { contains: 'act-' } } })
    await clearNoticeLog()
    await cleanCourse()
  }
  await prisma.$disconnect()
})

test('assigning Module 7 to an employee never locks them, and they can load, sign and complete it', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const { assigned } = await assignModule(prisma, await moduleIdOf(SECURITY), [STAFF], P.hr.id)
  assert.equal(assigned, 1)

  const row = await rowOf(STAFF, SECURITY)
  assert.equal(row?.source, 'SINGLE_ASSIGNMENT')
  assert.equal(row?.status, 'IN_PROGRESS')
  assert.equal(row?.assignedById, P.hr.id)
  assert.equal(row?.dueAt, null)
  assert.equal(await isFinished(STAFF), true)
  assert.equal(shouldBlockSession({ onboardingCompleted: await isFinished(STAFF), pathname: '/dashboard' }), false)

  const view = await loadModule(prisma, STAFF, SECURITY)
  assert.equal(view.plain, true)
  assert.deepEqual(view.rail, [])
  assert.equal(view.nextSlug, null)
  await completeAsThePageWould(STAFF, P.staff.name, SECURITY)

  const done = await rowOf(STAFF, SECURITY)
  assert.equal(done?.status, 'COMPLETED')
  assert.equal(done?.source, 'SINGLE_ASSIGNMENT')
  assert.equal(done?.versionId, (await moduleBySlug(SECURITY)).currentVersionId)
  assert.equal(await isFinished(STAFF), true)
})

test('completing an assigned module unlocks nothing and touches no other row', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await assignModule(prisma, await moduleIdOf('welcome'), [STAFF], P.hr.id)
  const next = await prisma.onboardingProgress.create({
    data: { userId: STAFF, moduleId: await moduleIdOf('culture-values'), status: 'LOCKED', source: 'SINGLE_ASSIGNMENT' },
  })
  await recordEvent(prisma, STAFF, 'welcome', { type: 'SCROLLED_END' })
  const result = await completeModule(prisma, STAFF, 'welcome')
  assert.deepEqual(result, { nextSlug: null, alreadyCompleted: false })

  const unchanged = await prisma.onboardingProgress.findUniqueOrThrow({ where: { id: next.id } })
  assert.equal(unchanged.status, 'LOCKED')
  assert.equal(unchanged.updatedAt.getTime(), next.updatedAt.getTime())
  assert.deepEqual(await readCourseProgress(prisma, STAFF), { modulesDone: false, dueAt: null })
})

test('assigning to all active skips inactive users and a hire who was never released', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await markInactive(P.buddy.id)
  await assignModule(prisma, await moduleIdOf(SECURITY), 'ALL_ACTIVE', P.hr.id)
  assert.equal((await rowOf(STAFF, SECURITY))?.source, 'SINGLE_ASSIGNMENT')
  assert.equal((await rowOf(P.lead.id, SECURITY))?.source, 'SINGLE_ASSIGNMENT')
  assert.equal(await rowOf(P.buddy.id, SECURITY), null)
  assert.equal(await rowOf(HIRE_ID, SECURITY), null)
})

test('a named list follows the same rules, and an unknown module changes nothing', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await markInactive(P.buddy.id)
  const { assigned } = await assignModule(prisma, await moduleIdOf(SECURITY), [STAFF, STAFF, P.buddy.id, HIRE_ID, 'act-nobody'], P.hr.id)
  assert.equal(assigned, 1)
  assert.equal(await rowOf(P.buddy.id, SECURITY), null)
  assert.equal(await rowOf(HIRE_ID, SECURITY), null)
  await assert.rejects(assignModule(prisma, 'act-no-module', [STAFF], P.hr.id), fails(404))
  await assert.rejects(requestReread(prisma, 'act-no-module', P.hr.id), fails(404))
})

test('the picker lists course modules and people who could take one', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await markInactive(P.buddy.id)
  const { modules, people } = await listAssignable(prisma)
  assert.equal(modules.length, SLUGS.length)
  assert.deepEqual(modules[6], { id: await moduleIdOf(SECURITY), number: 7, title: 'Security, Equipment and Data' })
  const ids = people.map((p) => p.id)
  assert.ok(ids.includes(STAFF))
  assert.equal(ids.includes(P.buddy.id), false)
  assert.equal(ids.includes(HIRE_ID), false)
})

test('re-read: a completed row moves to history with its version, and the live row shows the current one', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await assignModule(prisma, await moduleIdOf('welcome'), [STAFF], P.hr.id)
  await recordEvent(prisma, STAFF, 'welcome', { type: 'SCROLLED_END' })
  await completeModule(prisma, STAFF, 'welcome')
  const first = await rowOf(STAFF, 'welcome')
  assert.ok(first)

  const version2 = await publishNewVersion('welcome')
  const module = await moduleBySlug('welcome')
  assert.ok(isCourseModule(module))
  assert.equal(versionIdFor(first, module), first.versionId)

  const { reopened } = await requestReread(prisma, module.id, P.hr.id)
  assert.ok(reopened >= 1)
  const history = await prisma.onboardingProgressHistory.findMany({ where: { userId: STAFF, moduleId: module.id } })
  assert.equal(history.length, 1)
  assert.equal(history[0].versionId, first.versionId)
  assert.equal(history[0].completedAt.getTime(), first.completedAt?.getTime())

  const live = await rowOf(STAFF, 'welcome')
  assert.ok(live)
  assert.equal(live.status, 'IN_PROGRESS')
  assert.equal(live.source, 'REREAD')
  assert.equal(live.state, null)
  assert.equal(live.completedAt, null)
  assert.equal(live.startedAt, null)
  assert.equal(live.assignedById, P.hr.id)
  assert.equal(versionIdFor(live, module), version2.id)
  assert.equal((await loadModule(prisma, STAFF, 'welcome')).progress.status, 'IN_PROGRESS')

  await recordEvent(prisma, STAFF, 'welcome', { type: 'SCROLLED_END' })
  await completeModule(prisma, STAFF, 'welcome')
  assert.equal((await rowOf(STAFF, 'welcome'))?.versionId, version2.id)
})

test('an existing completed row is treated as a re-read when it is assigned again', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const moduleId = await moduleIdOf('welcome')
  await assignModule(prisma, moduleId, [STAFF], P.hr.id)
  await recordEvent(prisma, STAFF, 'welcome', { type: 'SCROLLED_END' })
  await completeModule(prisma, STAFF, 'welcome')
  assert.equal((await assignModule(prisma, moduleId, [STAFF], P.hr.id)).assigned, 1)
  const row = await rowOf(STAFF, 'welcome')
  assert.equal(row?.status, 'IN_PROGRESS')
  assert.equal(row?.source, 'REREAD')
  assert.equal(await prisma.onboardingProgressHistory.count({ where: { userId: STAFF, moduleId } }), 1)
})

test('a re-read gives everyone active a row, and leaves a locked course row locked', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await markInactive(P.buddy.id)
  await requestReread(prisma, await moduleIdOf(SECURITY), P.hr.id)
  assert.equal((await rowOf(STAFF, SECURITY))?.source, 'REREAD')
  assert.equal((await rowOf(STAFF, SECURITY))?.status, 'IN_PROGRESS')
  assert.equal(await rowOf(P.buddy.id, SECURITY), null)
  const locked = await rowOf(HIRE_ID, SECURITY)
  assert.equal(locked?.status, 'LOCKED')
  assert.equal(locked?.source, 'COURSE')
})

test('a re-read skips an inactive person with a completed row, and a hire not yet released', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  const moduleId = await moduleIdOf('welcome')
  await assignModule(prisma, moduleId, [P.buddy.id], P.hr.id)
  await recordEvent(prisma, P.buddy.id, 'welcome', { type: 'SCROLLED_END' })
  await completeModule(prisma, P.buddy.id, 'welcome')
  await markInactive(P.buddy.id)
  await requestReread(prisma, moduleId, P.hr.id)
  assert.equal((await rowOf(P.buddy.id, 'welcome'))?.status, 'COMPLETED')
  assert.equal(await prisma.onboardingProgressHistory.count({ where: { userId: P.buddy.id } }), 0)
  assert.equal(await rowOf(HIRE_ID, 'welcome'), null)
})

test('a hire mid-course keeps source COURSE, and the quiz locks until they re-complete it', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await scrollAndComplete('welcome')
  await finishWholeCourse(HIRE_ID)
  assert.notEqual((await loadQuiz(prisma, HIRE_ID)).status, 'LOCKED')
  const due = (await progressRow('welcome')).dueAt

  await requestReread(prisma, await moduleIdOf('welcome'), P.hr.id)
  const row = await progressRow('welcome')
  assert.equal(row.source, 'COURSE')
  assert.equal(row.status, 'IN_PROGRESS')
  assert.ok(due)
  assert.equal(row.dueAt, null)
  assert.equal((await readCourseProgress(prisma, HIRE_ID)).modulesDone, false)
  assert.equal((await loadQuiz(prisma, HIRE_ID)).status, 'LOCKED')

  const view = await loadModule(prisma, HIRE_ID, 'welcome')
  assert.equal(view.plain, false)
  assert.equal(view.rail.length, SLUGS.length)
  assert.equal(view.nextSlug, 'culture-values')
  assert.deepEqual(await loadAssigned(prisma, HIRE_ID), [])

  await scrollAndComplete('welcome')
  assert.equal((await readCourseProgress(prisma, HIRE_ID)).modulesDone, true)
  assert.notEqual((await loadQuiz(prisma, HIRE_ID)).status, 'LOCKED')
})

test('a finished hire stays finished and unlocked, reads through their rail, and adds up on the tracker', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await finishHire()
  assert.ok(await loadCompletion(prisma, HIRE_ID))
  await requestReread(prisma, await moduleIdOf('welcome'), P.hr.id)

  const row = await progressRow('welcome')
  assert.equal(row.source, 'REREAD')
  assert.equal(row.dueAt, null)
  assert.equal(await isFinished(HIRE_ID), true)
  assert.equal(shouldBlockSession({ onboardingCompleted: await isFinished(HIRE_ID), pathname: '/dashboard' }), false)
  assert.ok(await loadCompletion(prisma, HIRE_ID))

  const view = await loadModule(prisma, HIRE_ID, 'welcome')
  assert.equal(view.plain, false)
  assert.equal(view.rail.length, SLUGS.length)
  assert.equal(view.nextSlug, null)
  assert.deepEqual((await loadAssigned(prisma, HIRE_ID)).map((a) => a.slug), ['welcome'])
  assert.equal(await trackedDone(), SLUGS.length - 1)

  await recordEvent(prisma, HIRE_ID, 'welcome', { type: 'SCROLLED_END' })
  assert.equal((await completeModule(prisma, HIRE_ID, 'welcome')).nextSlug, null)
  assert.equal(await trackedDone(), SLUGS.length)
  await prisma.$transaction((tx) => finishCourseIfDone(tx, HIRE_ID))
  assert.equal(await isFinished(HIRE_ID), true)
})

test('signing a new version of Module 7 adds a second row, and the first stays', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const moduleId = await moduleIdOf(SECURITY)
  await assignModule(prisma, moduleId, [STAFF], P.hr.id)
  await completeAsThePageWould(STAFF, P.staff.name, SECURITY)
  const [first] = await prisma.onboardingAcknowledgement.findMany({ where: { userId: STAFF, kind: 'SECURITY_SOPS' } })
  assert.equal((await loadModule(prisma, STAFF, SECURITY)).securityAcknowledgement?.typedName, P.staff.name)

  const version2 = await publishNewVersion(SECURITY)
  // A completed row stays on the version it was signed on.
  assert.ok((await loadModule(prisma, STAFF, SECURITY)).securityAcknowledgement)

  await requestReread(prisma, moduleId, P.hr.id)
  const view = await loadModule(prisma, STAFF, SECURITY)
  assert.equal(view.securityAcknowledgement, null)
  await recordEvent(prisma, STAFF, SECURITY, { type: 'SCROLLED_END' })
  for (const block of view.blocks) {
    if (block.type !== 'checklist') continue
    for (const item of block.items) await recordEvent(prisma, STAFF, SECURITY, { type: 'CHECK', key: item.key, checked: true })
  }
  await assert.rejects(completeModule(prisma, STAFF, SECURITY), fails(409))

  await signAcknowledgement(prisma, STAFF, { kind: 'SECURITY_SOPS', typedName: P.staff.name, moduleSlug: SECURITY })
  await signAcknowledgement(prisma, STAFF, { kind: 'SECURITY_SOPS', typedName: P.staff.name, moduleSlug: SECURITY })
  const signed = await prisma.onboardingAcknowledgement.findMany({ where: { userId: STAFF, kind: 'SECURITY_SOPS' }, orderBy: { signedAt: 'asc' } })
  assert.equal(signed.length, 2)
  assert.equal(signed[0].id, first.id)
  assert.equal(signed[0].moduleVersionId, first.moduleVersionId)
  assert.equal(signed[1].moduleVersionId, version2.id)
  await completeModule(prisma, STAFF, SECURITY)
  assert.equal((await rowOf(STAFF, SECURITY))?.status, 'COMPLETED')
})

test("a hire's signature stands while they read the version they signed", ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await finishWholeCourse(HIRE_ID)
  const module = await moduleBySlug(SECURITY)
  await prisma.onboardingAcknowledgement.create({
    data: { userId: HIRE_ID, kind: 'SECURITY_SOPS', statementText: 'Fictional', moduleVersionId: module.currentVersionId, typedName: P.hire.name },
  })
  await publishNewVersion(SECURITY)
  assert.ok((await loadModule(prisma, HIRE_ID, SECURITY)).securityAcknowledgement)
})

test('running the same assign again creates nothing and sends nothing twice', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const module = await moduleBySlug(SECURITY)
  const { calls, send } = recorder()
  const first = await assignModule(prisma, module.id, [STAFF, P.lead.id], P.hr.id)
  await notifyAssigned(prisma, first.notice, { send, now: DAY_ONE })
  assert.deepEqual(calls.map((c) => c.to).sort(), [P.lead.email, P.staff.email].sort())
  assert.ok(calls.every((c) => c.slug === SECURITY && c.title === module.title))
  assert.ok(calls.some((c) => c.name === P.staff.name))
  assert.equal(
    await prisma.onboardingNotificationLog.count({ where: { key: `assign:${STAFF}:${module.id}:${module.currentVersionId}:2026-12-01` } }),
    1,
  )

  const before = await rowOf(STAFF, SECURITY)
  const second = await assignModule(prisma, module.id, [STAFF, P.lead.id], P.hr.id)
  assert.equal(second.assigned, 0)
  await notifyAssigned(prisma, second.notice, { send, now: DAY_ONE })
  assert.equal(calls.length, 2)
  assert.equal((await rowOf(STAFF, SECURITY))?.updatedAt.getTime(), before?.updatedAt.getTime())
  assert.equal(await prisma.onboardingProgress.count({ where: { userId: STAFF } }), 1)
  assert.equal(await prisma.onboardingProgressHistory.count({ where: { userId: STAFF } }), 0)
})

test('a failed notice fails nothing, is logged with ids only, and a re-run retries it', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const moduleId = await moduleIdOf(SECURITY)
  const failing = recorder((to) => to === P.lead.email)
  const logged: unknown[][] = []
  const original = console.error
  console.error = (...args: unknown[]) => { logged.push(args) }
  try {
    const { notice } = await assignModule(prisma, moduleId, [STAFF, P.lead.id], P.hr.id)
    await notifyAssigned(prisma, notice, { send: failing.send, now: DAY_ONE })
  } finally {
    console.error = original
  }
  assert.equal(failing.calls.length, 2)
  assert.ok(logged.length > 0)
  assert.equal(JSON.stringify(logged).includes(P.lead.email), false)
  assert.equal(JSON.stringify(logged).includes(P.lead.name), false)

  const retry = recorder()
  const { notice } = await assignModule(prisma, moduleId, [STAFF, P.lead.id], P.hr.id)
  await notifyAssigned(prisma, notice, { send: retry.send, now: DAY_ONE })
  assert.deepEqual(retry.calls.map((c) => c.to), [P.lead.email])
})

test('a notice for a module that is gone sends nothing and never throws', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const { send, calls } = recorder()
  await notifyAssigned(prisma, { moduleId: 'act-no-module', versionId: 'act-none', userIds: [STAFF] }, { send })
  assert.equal(calls.length, 0)
})

test('assigning over a hire mid-course leaves an open or locked row alone and sends nothing', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const { assigned, notice } = await assignModule(prisma, await moduleIdOf(SECURITY), [HIRE_ID], P.hr.id)
  assert.equal(assigned, 0)
  assert.deepEqual(notice.userIds, [])
  const row = await rowOf(HIRE_ID, SECURITY)
  assert.equal(row?.status, 'LOCKED')
  assert.equal(row?.source, 'COURSE')
})

test('staff with a leftover open course row get it as an assignment, since they have no course', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const moduleId = await moduleIdOf('welcome')
  await prisma.onboardingProgress.create({ data: { userId: STAFF, moduleId, status: 'LOCKED' } })
  await assert.rejects(loadModule(prisma, STAFF, 'welcome'), fails(404))
  assert.equal((await assignModule(prisma, moduleId, [STAFF], P.hr.id)).assigned, 1)
  const row = await rowOf(STAFF, 'welcome')
  assert.equal(row?.source, 'SINGLE_ASSIGNMENT')
  assert.equal(row?.status, 'IN_PROGRESS')
  assert.equal((await loadModule(prisma, STAFF, 'welcome')).plain, true)
})

test('staff reach only assigned rows: nothing else opens, and the course and quiz stay closed', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await assert.rejects(loadModule(prisma, STAFF, SECURITY), fails(404))
  await assert.rejects(recordEvent(prisma, STAFF, SECURITY, { type: 'SCROLLED_END' }), fails(404))
  await assert.rejects(completeModule(prisma, STAFF, SECURITY), fails(404))

  await prisma.onboardingProgress.create({ data: { userId: STAFF, moduleId: await moduleIdOf('welcome'), status: 'IN_PROGRESS', source: 'COURSE' } })
  await assert.rejects(loadModule(prisma, STAFF, 'welcome'), fails(404))
  await assert.rejects(recordEvent(prisma, STAFF, 'welcome', { type: 'SCROLLED_END' }), fails(404))
  await assert.rejects(completeModule(prisma, STAFF, 'welcome'), fails(404))

  await assignModule(prisma, await moduleIdOf(SECURITY), [STAFF], P.hr.id)
  assert.deepEqual(await loadHome(prisma, STAFF), { released: false })
  await assert.rejects(loadQuiz(prisma, STAFF), fails(404))
  assert.equal(await buildAcademyContext(prisma, STAFF), null)
})

test('staff context: attributes from the user, no per-hire blocks, the same placeholder fallbacks', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await prisma.user.update({
    where: { id: STAFF },
    data: { position: 'Fictional Analyst', department: 'Research', officeLocation: 'REMOTE', remoteCountry: 'ID', contractType: 'INDEPENDENT_CONTRACTOR' },
  })
  await assignModule(prisma, await moduleIdOf('welcome'), [STAFF], P.hr.id)
  const row = await rowOf(STAFF, 'welcome')
  assert.ok(row)
  const context = await buildAcademyContext(prisma, STAFF, row)
  assert.ok(context)
  assert.equal(context.hasCourse, false)
  assert.equal(context.attributes.officeLocation, 'REMOTE')
  assert.equal(context.attributes.contractType, 'INDEPENDENT_CONTRACTOR')
  assert.equal(context.department, 'Research')
  assert.equal(context.lead, null)
  assert.equal(context.buddy, null)
  assert.deepEqual(context.team, [])
  assert.deepEqual(context.tutorials, [])
  assert.deepEqual(context.teamTools, [])
  assert.equal(context.roleExpectations, null)
  assert.equal(context.placeholders['preferred name'], 'Ana')
  assert.equal(context.placeholders.title, 'Fictional Analyst')
  assert.equal(context.placeholders['lead first name'], '')
})

const STAFF_ATTRIBUTES = [
  ['no attributes at all', {}],
  ['a Pakistan employee', { officeLocation: 'KARACHI', workMode: 'HYBRID', contractType: 'PK_EMPLOYMENT', employmentStatus: 'PERMANENT' }],
  ['a contractor', CONTRACTOR_ATTRIBUTES],
] as const

for (const [label, attributes] of STAFF_ATTRIBUTES) {
  test(`staff with ${label} can complete every one of the 14 modules`, ACADEMY_DB_TEST, async () => {
    await createReleasedHire()
    await prisma.user.update({ where: { id: STAFF }, data: attributes as Prisma.UserUpdateInput })
    for (const slug of SLUGS) {
      await assignModule(prisma, await moduleIdOf(slug), [STAFF], P.hr.id)
      await completeAsThePageWould(STAFF, P.staff.name, slug)
      assert.equal((await rowOf(STAFF, slug))?.status, 'COMPLETED', slug)
    }
    assert.equal(await isFinished(STAFF), true)
  })
}

for (const [label, contractType] of [['no contract', null], ['a PK contract', 'PK_EMPLOYMENT'], ['a contractor', 'INDEPENDENT_CONTRACTOR']] as const) {
  test(`reading Module 11 with ${label}: a scroll completes it, no field shows and nothing can be saved`, ACADEMY_DB_TEST, async () => {
    await createReleasedHire()
    await prisma.user.update({ where: { id: STAFF }, data: { contractType } })
    await assignModule(prisma, await moduleIdOf('getting-paid'), [STAFF], P.hr.id)
    const view = await loadModule(prisma, STAFF, 'getting-paid')
    assert.equal(view.progress.effectiveRule, 'SCROLL_END')
    assert.equal(view.blocks.some((b) => b.type === 'inputField'), false)
    await assert.rejects(saveBankDetails(prisma, STAFF, BANK), contractType === 'PK_EMPLOYMENT' ? READING_ONLY : fails(400))
    await assert.rejects(savePayout(prisma, STAFF, WISE), contractType === 'PK_EMPLOYMENT' ? fails(400) : READING_ONLY)
    assert.equal(await prisma.onboardingPaymentDetails.count({ where: { userId: STAFF } }), 0)
    await recordEvent(prisma, STAFF, 'getting-paid', { type: 'SCROLLED_END' })
    await completeModule(prisma, STAFF, 'getting-paid')
    assert.equal((await rowOf(STAFF, 'getting-paid'))?.status, 'COMPLETED')
  })
}

test('reading Module 8: a scroll completes it, no field shows and the link is refused', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await assignModule(prisma, await moduleIdOf('linkedin'), [STAFF], P.hr.id)
  const view = await loadModule(prisma, STAFF, 'linkedin')
  assert.equal(view.progress.effectiveRule, 'SCROLL_END')
  assert.equal(view.blocks.some((b) => b.type === 'inputField'), false)
  await assert.rejects(saveLinkedinUrl(prisma, STAFF, LINKEDIN), READING_ONLY)
})

test('the re-read reset keeps a saved LinkedIn link and clears the rest', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID, module: { slug: 'linkedin' } }, data: { status: 'IN_PROGRESS' } })
  await saveLinkedinUrl(prisma, HIRE_ID, LINKEDIN)
  await recordEvent(prisma, HIRE_ID, 'linkedin', { type: 'SCROLLED_END' })
  await completeModule(prisma, HIRE_ID, 'linkedin')
  await requestReread(prisma, await moduleIdOf('linkedin'), P.hr.id)
  const row = await progressRow('linkedin')
  assert.equal(row.status, 'IN_PROGRESS')
  assert.deepEqual(row.state, { checks: {}, linksOpenedAt: {}, scrolledToEnd: false, linkedinUrl: LINKEDIN })
})

test('a reopened Module 11 keeps the bank lock when details were saved, and a hire with none can still save', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const moduleId = await moduleIdOf('getting-paid')
  await prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID, moduleId }, data: { status: 'IN_PROGRESS' } })
  await saveBankDetails(prisma, HIRE_ID, BANK)
  await saveBankDetails(prisma, HIRE_ID, { ...BANK, bankName: 'Other Bank' })
  await completeModule(prisma, HIRE_ID, 'getting-paid')
  await requestReread(prisma, moduleId, P.hr.id)
  await assert.rejects(saveBankDetails(prisma, HIRE_ID, BANK), fails(409, BANK_LOCKED_MESSAGE))
  assert.equal((await loadModule(prisma, HIRE_ID, 'getting-paid')).progress.effectiveRule, 'PAYMENT_SETUP')

  await prisma.onboardingPaymentDetails.deleteMany({ where: { userId: HIRE_ID } })
  await saveBankDetails(prisma, HIRE_ID, BANK)
  assert.equal(await prisma.onboardingPaymentDetails.count({ where: { userId: HIRE_ID } }), 1)
})

test('savePayout needs an open Module 11 course row, and a contractor may update after finishing it', ACADEMY_DB_TEST, async () => {
  await createReleasedHire({ attributes: CONTRACTOR_ATTRIBUTES })
  await prisma.user.update({ where: { id: STAFF }, data: { contractType: 'INDEPENDENT_CONTRACTOR' } })
  await assert.rejects(savePayout(prisma, STAFF, WISE), fails(404))
  await assert.rejects(savePayout(prisma, HIRE_ID, WISE), fails(404))
  assert.equal(await prisma.onboardingPaymentChangeLog.count({ where: { userId: { in: [STAFF, HIRE_ID] } } }), 0)

  await prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID, module: { slug: 'getting-paid' } }, data: { status: 'IN_PROGRESS' } })
  assert.deepEqual(await savePayout(prisma, HIRE_ID, WISE), { isUpdate: false })
  await prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID, module: { slug: 'getting-paid' } }, data: { status: 'COMPLETED' } })
  assert.deepEqual(await savePayout(prisma, HIRE_ID, { ...WISE, currency: 'EUR' }), { isUpdate: true })
})

test('a reopened course row has no due date: reminders skip it and a recompute leaves it alone', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await scrollAndComplete('welcome')
  await requestReread(prisma, await moduleIdOf('welcome'), P.hr.id)
  await prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID, module: { slug: { notIn: ['welcome'] } } }, data: { dueAt: null, status: 'COMPLETED' } })

  assert.equal(await recomputeDueDates(prisma, HIRE_ID), 0)
  assert.equal((await progressRow('welcome')).dueAt, null)

  const overdue: unknown[] = []
  const noop = async () => ({ success: true })
  const senders: ReminderSenders = {
    leadInputOverdue: noop,
    buddy: noop,
    moduleOverdue: async (input) => {
      overdue.push(input)
      return { success: true }
    },
    checklistDigest: noop,
  }
  await runOnboardingJob(prisma, new Date('2027-01-11T05:00:00.000Z'), senders)
  assert.deepEqual(overdue, [])

  // The same row with a past date is chased, so the empty list above means something.
  await prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID, module: { slug: 'welcome' } }, data: { dueAt: new Date('2026-12-02T00:00:00.000Z') } })
  await runOnboardingJob(prisma, new Date('2027-01-12T05:00:00.000Z'), senders)
  assert.equal(overdue.length, 1)
})

test('a hire signing values with a reopened module is refused until it is done, then finishes', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await finishWholeCourse(HIRE_ID)
  await prisma.onboardingAcknowledgement.create({
    data: { userId: HIRE_ID, kind: 'SECURITY_SOPS', statementText: 'Fictional', moduleVersionId: (await moduleBySlug(SECURITY)).currentVersionId, typedName: P.hire.name },
  })
  await prisma.quizAttempt.create({ data: { userId: HIRE_ID, score: 10, totalQuestions: 10, passed: true, answersJson: [] } })
  await requestReread(prisma, await moduleIdOf('welcome'), P.hr.id)

  await assert.rejects(signValuesAcknowledgement(prisma, HIRE_ID, P.hire.name), fails(409, 'Finish the reopened module first.'))
  assert.equal(await prisma.onboardingAcknowledgement.count({ where: { userId: HIRE_ID, kind: 'VALUES_CODE_OF_CONDUCT' } }), 0)
  await scrollAndComplete('welcome')
  assert.equal((await signValuesAcknowledgement(prisma, HIRE_ID, P.hire.name)).completed, true)
  assert.equal(await isFinished(HIRE_ID), true)
})

test('a finished hire on a re-read can still repeat the values signature', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await finishHire()
  await prisma.quizAttempt.create({ data: { userId: HIRE_ID, score: 10, totalQuestions: 10, passed: true, answersJson: [] } })
  await requestReread(prisma, await moduleIdOf('welcome'), P.hr.id)
  assert.equal((await signValuesAcknowledgement(prisma, HIRE_ID, P.hire.name)).completed, false)
})

test('a reopen waits for a hire finishing at that moment and then treats them as finished', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await finishWholeCourse(HIRE_ID)
  const moduleId = await moduleIdOf('welcome')
  await prisma.$transaction(async (tx) => {
    await lockUserRow(tx, HIRE_ID)
    pending = requestReread(prisma, moduleId, P.hr.id)
    await new Promise((resolve) => setTimeout(resolve, 400))
    await tx.user.update({ where: { id: HIRE_ID }, data: { onboardingCompleted: true } })
  }, { timeout: 15_000 })
  await pending
  assert.equal((await progressRow('welcome')).source, 'REREAD')
})

test('reopening notifies on a later day, and a same-day repeat stays silent', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const moduleId = await moduleIdOf('welcome')
  const { calls, send } = recorder()
  await notifyAssigned(prisma, (await assignModule(prisma, moduleId, [STAFF], P.hr.id)).notice, { send, now: DAY_ONE })
  await recordEvent(prisma, STAFF, 'welcome', { type: 'SCROLLED_END' })
  await completeModule(prisma, STAFF, 'welcome')

  await notifyAssigned(prisma, (await assignModule(prisma, moduleId, [STAFF], P.hr.id)).notice, { send, now: DAY_ONE })
  assert.equal(calls.length, 1)
  await notifyAssigned(prisma, (await assignModule(prisma, moduleId, [STAFF], P.hr.id)).notice, { send, now: DAY_TWO })
  assert.equal(calls.length, 2)
})

test('the send limit counts after the once-only check, so running again reaches everyone', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const moduleId = await moduleIdOf(SECURITY)
  const { calls, send } = recorder()
  const original = console.error
  console.error = () => undefined
  try {
    const people = [STAFF, P.lead.id, P.buddy.id, P.hr.id]
    for (let run = 0; run < people.length + 1; run += 1) {
      const { notice } = await assignModule(prisma, moduleId, people, P.hr.id)
      await notifyAssigned(prisma, { ...notice, userIds: people }, { send, now: DAY_ONE, limit: 1 })
    }
  } finally {
    console.error = original
  }
  assert.ok(calls.length >= 4)
  assert.equal(new Set(calls.map((c) => c.to)).size, 4)
  assert.equal(calls.length, new Set(calls.map((c) => c.to)).size)
})

test('someone with no email gets no notice and no log row, and a hire mid-course gets the neutral notice', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await scrollAndComplete('welcome')
  await prisma.user.update({ where: { id: STAFF }, data: { email: null } })
  const moduleId = await moduleIdOf('welcome')
  const { calls, send } = recorder()
  const { notice } = await assignModule(prisma, moduleId, [STAFF, HIRE_ID], P.hr.id)
  await notifyAssigned(prisma, notice, { send, now: DAY_ONE })
  assert.deepEqual(calls.map((c) => [c.to, c.inCourse]), [[P.hire.email, true]])
  assert.equal(await prisma.onboardingNotificationLog.count({ where: { key: { startsWith: `assign:${STAFF}:` } } }), 0)
})

test('loadAssigned lists open assigned and re-read modules in course order, and nothing else', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  assert.deepEqual(await loadAssigned(prisma, STAFF), [])
  await assignModule(prisma, await moduleIdOf(SECURITY), [STAFF], P.hr.id)
  await requestReread(prisma, await moduleIdOf('welcome'), P.hr.id)
  const items = await loadAssigned(prisma, STAFF)
  assert.deepEqual(items.map((i) => [i.slug, i.reread]), [['welcome', true], [SECURITY, false]])
  assert.equal(items[1].title, (await moduleBySlug(SECURITY)).title)
  assert.ok(items[1].estimatedMinutes > 0)

  await recordEvent(prisma, STAFF, 'welcome', { type: 'SCROLLED_END' })
  await completeModule(prisma, STAFF, 'welcome')
  assert.deepEqual((await loadAssigned(prisma, STAFF)).map((i) => i.slug), [SECURITY])
  assert.deepEqual(await loadAssigned(prisma, HIRE_ID), [])
})
