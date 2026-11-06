import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import type { PrismaClient } from '@prisma/client'
import { prisma } from '../lib/db'
import { AcademyError } from '../lib/academy/errors'
import { syncChecklist, syncChecklists } from '../lib/academy/service/checklist'
import { loadHome, loadModule } from '../lib/academy/service/course'
import { saveBankDetails, saveLinkedinUrl } from '../lib/academy/service/fields'
import { savePayout } from '../lib/academy/service/payout'
import { saveSetup } from '../lib/academy/service/setup'
import { unlockModule, verifyLinkedin, tickChecklistItem, clearHireQuiz } from '../lib/academy/service/tracker-actions'
import { loadAcknowledgementRows, loadDrawer, loadPaymentTracker, loadTracker } from '../lib/academy/service/tracker'
import { ACADEMY_DB_TEST, P } from './helpers/academy-test-db'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'
import {
  CONTRACTOR_ATTRIBUTES,
  HIRE_ID,
  NEW_HIRE_ID,
  SLUGS,
  cleanCourse,
  createReadyHire,
  createReleasedHire, openPaymentModule,
  progressRow,
  scrollAndComplete,
  setupBody,
} from './helpers/academy-course-fixtures'

process.env.ONBOARDING_FIELD_ENCRYPTION_KEY = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'

const HR = { id: P.hr.id, role: 'HR' }
const OA = { id: P.oa.id, role: 'OA' }
const EMPLOYEE = { id: P.staff.id, role: 'EMPLOYEE' }
const SECURITY = { id: 'act-sec', role: 'SECURITY' }
const LEAD = { id: P.lead.id, role: 'EMPLOYEE' }

const LINKEDIN = 'https://www.linkedin.com/in/cara-lindqvist'
const WISE = { method: 'WISE', accountHolderName: 'Cara Lindqvist', payoutEmail: 'cara@example.test', currency: 'USD' }
const BANK = { accountTitle: 'Cara Lindqvist', bankName: 'Fictional Bank', branch: 'Main', iban: 'PK36SCBL0000001123456702' }
const DAY_MS = 24 * 60 * 60 * 1000

/** The real client, except that one checklist write fails when `fail` says so. */
function failingWrites(method: 'createMany' | 'updateMany', fail: (args: unknown) => boolean): PrismaClient {
  return new Proxy(prisma, {
    get(target, prop, receiver) {
      if (prop !== 'onboardingChecklistItem') return Reflect.get(target, prop, receiver)
      return new Proxy(target.onboardingChecklistItem, {
        get(model, name) {
          const real = Reflect.get(model, name).bind(model)
          if (name !== method) return real
          return async (args: unknown) => {
            if (fail(args)) throw new Error('write refused')
            return real(args)
          }
        },
      })
    },
  })
}

const hasStatus = (status: number) => (e: unknown) => e instanceof AcademyError && e.status === status

async function extraHire(id: string, over: Record<string, unknown> = {}): Promise<void> {
  await prisma.position.create({ data: { id: `act-pos-${id}`, title: 'Associate' } })
  await prisma.newHire.create({
    data: {
      id: `act-${id}`, positionId: `act-pos-${id}`, name: `Hire ${id}`, title: 'Associate', email: `act-${id}@example.test`,
      onboardingDate: new Date('2026-12-07T00:00:00.000Z'), ...over,
    },
  })
}

/** A hire who finished `daysAgo` days ago: COMPLETED, with the values signature that marks the finish. */
async function finishedHire(id: string, daysAgo: number): Promise<void> {
  const userId = `act-user-${id}`
  await prisma.user.create({ data: { id: userId, name: `Done ${id}`, role: 'EMPLOYEE', email: `act-user-${id}@example.test`, onboardingCompleted: true } })
  await extraHire(id, { status: 'COMPLETED', userId })
  await prisma.onboardingAcknowledgement.create({
    data: {
      userId, kind: 'VALUES_CODE_OF_CONDUCT', statementText: 'I agree.', typedName: `Done ${id}`,
      signedAt: new Date(Date.now() - daysAgo * DAY_MS),
    },
  })
}

const attempt = (over: Record<string, unknown> = {}) => ({
  userId: HIRE_ID, score: 10, totalQuestions: 12, passed: true,
  answersJson: [{ questionId: 'q', chosen: 'a', correct: true, correctAnswer: 'a' }],
  ...over,
})

async function rowFor(newHireId = NEW_HIRE_ID) {
  const row = (await loadTracker(prisma, HR, {})).find((r) => r.newHireId === newHireId)
  assert.ok(row, newHireId)
  return row
}

async function openLinkedinModule(url: string | null = LINKEDIN) {
  const row = await progressRow('linkedin')
  await prisma.onboardingProgress.update({ where: { id: row.id }, data: { status: 'IN_PROGRESS', unlockedEarlyById: P.hr.id } })
  if (url) await saveLinkedinUrl(prisma, HIRE_ID, url)
  return row
}

const itemFor = (key: string, newHireId = NEW_HIRE_ID) =>
  prisma.onboardingChecklistItem.findFirstOrThrow({ where: { newHireId, templateItem: { key } } })

async function cleanAll(): Promise<void> {
  await cleanCourse()
  await prisma.onboardingChecklistTemplateItem.deleteMany({ where: { key: 'act-new-item' } })
}

beforeEach(async () => {
  if (WEEKLY_DB_READY) await cleanAll()
})
after(async () => {
  if (WEEKLY_DB_READY) await cleanAll()
  await prisma.$disconnect()
})

test('a plain employee gets 403 from every read at the service seam', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  for (const viewer of [EMPLOYEE, SECURITY]) {
    await assert.rejects(loadTracker(prisma, viewer, {}), hasStatus(403))
    await assert.rejects(loadDrawer(prisma, viewer, NEW_HIRE_ID), hasStatus(403))
    await assert.rejects(loadPaymentTracker(prisma, viewer), hasStatus(403))
    await assert.rejects(loadAcknowledgementRows(prisma, viewer, NEW_HIRE_ID), hasStatus(403))
  }
  await assert.rejects(loadAcknowledgementRows(prisma, OA, NEW_HIRE_ID), hasStatus(403))
})

test('OA is refused the drawer and the full rows, and gets the payment list only', ACADEMY_DB_TEST, async () => {
  await createReleasedHire({ attributes: CONTRACTOR_ATTRIBUTES })
  await openPaymentModule()
  await savePayout(prisma, HIRE_ID, WISE)
  await assert.rejects(loadDrawer(prisma, OA, NEW_HIRE_ID), hasStatus(403))
  await assert.rejects(loadTracker(prisma, OA, {}), hasStatus(403))

  const [row, ...rest] = await loadPaymentTracker(prisma, OA)
  assert.equal(rest.length, 0)
  assert.deepEqual(Object.keys(row).sort(), ['department', 'joiningDate', 'name', 'newHireId', 'paymentStatus'])
  assert.equal(row.newHireId, NEW_HIRE_ID)
  assert.equal(row.name, P.hire.name)
  assert.equal(row.department, 'Research')
  assert.equal(row.paymentStatus.saved, true)
  assert.equal(row.paymentStatus.method, 'WISE')
  assert.equal(row.paymentStatus.userId, HIRE_ID)
  assert.ok(row.paymentStatus.lastChangedAt)
  assert.equal(JSON.stringify(row).includes('example.test'), false)
})

test('OA reading the list writes nothing to the checklist', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await prisma.onboardingChecklistItem.deleteMany({ where: { newHireId: NEW_HIRE_ID } })
  await loadPaymentTracker(prisma, OA)
  assert.equal(await prisma.onboardingChecklistItem.count({ where: { newHireId: NEW_HIRE_ID } }), 0)
})

test('loadTracker counts modules, overdue modules, quiz score and the checklist', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await scrollAndComplete(SLUGS[0])
  await scrollAndComplete(SLUGS[1])
  await prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID }, data: { dueAt: new Date(Date.now() + 30 * DAY_MS) } })
  for (const slug of [SLUGS[2], SLUGS[3]]) {
    const row = await progressRow(slug)
    await prisma.onboardingProgress.update({ where: { id: row.id }, data: { dueAt: new Date(Date.now() - DAY_MS) } })
  }
  await prisma.quizAttempt.create({ data: attempt({ score: 7, passed: false, createdAt: new Date(Date.now() - DAY_MS) }) })
  await prisma.quizAttempt.create({ data: attempt() })

  const row = await rowFor()
  assert.equal(row.modulesDone, 2)
  assert.equal(row.modulesTotal, 14)
  assert.equal(row.overdueCount, 2)
  assert.equal(row.quizScore, '10 of 12')
  assert.equal(row.checklistTotal, 17)
  assert.equal(row.checklistDone, await prisma.onboardingChecklistItem.count({ where: { newHireId: NEW_HIRE_ID, doneAt: { not: null } } }))
  assert.ok(row.checklistDone > 0, 'the load ticks what is already met')
  assert.equal(row.name, P.hire.name)
  assert.equal(row.title, 'Analyst')
  assert.equal(row.department, 'Research')
  assert.equal(row.location, 'Karachi')
  assert.equal(row.joiningDate, '2026-12-01T00:00:00.000Z')
  assert.equal(row.finishedAt, null)
})

test('a legacy quiz attempt never shows as a score', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await prisma.quizAttempt.create({ data: attempt({ answersJson: { q1: 'a' } }) })
  assert.equal((await rowFor()).quizScore, null)
})

test('a hire with no course yet shows zero modules and no crash', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await extraHire('unlinked')
  const ready = await rowFor()
  assert.equal(ready.modulesDone, 0)
  assert.equal(ready.modulesTotal, 0)
  assert.equal(ready.quizScore, null)
  const unlinked = await rowFor('act-unlinked')
  assert.equal(unlinked.name, 'Hire unlinked')
  assert.equal(unlinked.modulesTotal, 0)
  assert.equal(unlinked.location, null)
  assert.deepEqual(unlinked.paymentStatus, { userId: null, saved: false, method: null, lastChangedAt: null })
  assert.equal(unlinked.checklistTotal, 17, 'the load backfills the checklist')

  const drawer = await loadDrawer(prisma, HR, 'act-unlinked')
  assert.deepEqual(drawer.modules, [])
  assert.deepEqual(drawer.quizAttempts, [])
  assert.equal(drawer.payment, null)
  assert.equal(drawer.linkedin.url, null)
})

test('finished hires stay listed for 30 days, then drop off', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await finishedHire('recent', 29)
  await finishedHire('old', 31)
  await extraHire('legacy', { status: 'COMPLETED' })
  const rows = await loadTracker(prisma, HR, {})
  const ids = rows.map((r) => r.newHireId)
  assert.ok(ids.includes('act-recent'))
  assert.equal(ids.includes('act-old'), false)
  assert.equal(ids.includes('act-legacy'), false, 'no Academy signature, so no known finish date')
  const recent = rows.find((r) => r.newHireId === 'act-recent')
  assert.equal(recent?.status, 'COMPLETED')
  assert.ok(recent?.finishedAt)
})

test('filters narrow the list by location, department and status', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await extraHire('other', { department: 'Ops', officeLocation: 'REMOTE', remoteCountry: 'ID', status: 'ONBOARDING' })
  const ids = async (filters: Parameters<typeof loadTracker>[2]) =>
    (await loadTracker(prisma, HR, filters)).map((r) => r.newHireId)
  assert.deepEqual(await ids({ department: 'Ops' }), ['act-other'])
  assert.deepEqual(await ids({ location: 'Indonesia' }), ['act-other'])
  assert.deepEqual(await ids({ location: 'Karachi' }), [NEW_HIRE_ID])
  assert.deepEqual(await ids({ status: 'ONBOARDING' }), ['act-other'])
  assert.deepEqual(await ids({ status: 'PENDING', department: 'Ops' }), [])
})

test('syncing many hires reads no more than syncing one', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await extraHire('two')
  await extraHire('three')
  await syncChecklists(prisma, [NEW_HIRE_ID, 'act-two', 'act-three'])
  let reads = 0
  const counted = prisma.$extends({
    query: {
      $allOperations({ operation, args, query }) {
        if (operation.startsWith('find') || operation === 'count') reads += 1
        return query(args)
      },
    },
  }) as unknown as PrismaClient
  await syncChecklists(counted, [NEW_HIRE_ID])
  const forOne = reads
  reads = 0
  await syncChecklists(counted, [NEW_HIRE_ID, 'act-two', 'act-three'])
  assert.equal(reads, forOne)
})

test('a template change never reaches a hire who already has a checklist', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await finishedHire('recent', 5)
  await extraHire('fresh')
  await syncChecklists(prisma, [NEW_HIRE_ID, 'act-recent'])
  const count = (newHireId: string) => prisma.onboardingChecklistItem.count({ where: { newHireId } })
  assert.equal(await count(NEW_HIRE_ID), 17)

  await prisma.onboardingChecklistTemplateItem.create({
    data: { key: 'act-new-item', title: 'A new step', ownerRole: 'HR', dueOffsetDays: 1, orderIndex: 99 },
  })
  await prisma.onboardingChecklistTemplateItem.update({ where: { key: 'hr-call' }, data: { isActive: false } })
  await prisma.onboardingChecklistItem.deleteMany({ where: { newHireId: 'act-recent', templateItem: { key: 'hr-call' } } })
  await prisma.onboardingChecklistTemplateItem.update({ where: { key: 'hr-call' }, data: { isActive: true } })

  await loadTracker(prisma, HR, {})
  await syncChecklist(prisma, NEW_HIRE_ID)
  await saveSetup(prisma, NEW_HIRE_ID, setupBody(), P.hr.id)
  assert.equal(await count(NEW_HIRE_ID), 17, 'neither the sync nor a setup save adds to it')
  assert.equal(await count('act-recent'), 16, 'a removed row is not brought back')
  assert.equal(await count('act-fresh'), 18, 'a hire with none gets the new item')
})

test('one row that will not write does not stop the others', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await syncChecklist(prisma, NEW_HIRE_ID)
  await prisma.onboardingChecklistItem.updateMany({ where: { newHireId: NEW_HIRE_ID }, data: { doneAt: null, autoTicked: false } })
  const bad = await itemFor('lead-input')
  const client = failingWrites('updateMany', (args) => (args as { where: { id: string } }).where.id === bad.id)
  assert.ok(await syncChecklist(client, NEW_HIRE_ID) > 0)
  assert.equal((await itemFor('lead-input')).doneAt, null)
  assert.ok((await itemFor('setup-complete')).doneAt, 'the rest still tick')
})

test('a tracker read survives a sync that fails, on stored data', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await prisma.onboardingChecklistItem.deleteMany({ where: { newHireId: NEW_HIRE_ID } })
  const client = failingWrites('createMany', () => true)

  const rows = await loadTracker(client, HR, {})
  assert.deepEqual(rows.map((r) => [r.newHireId, r.modulesTotal, r.checklistTotal]), [[NEW_HIRE_ID, 14, 0]])
  const drawer = await loadDrawer(client, HR, NEW_HIRE_ID)
  assert.equal(drawer.modules.length, 14)
  assert.deepEqual(drawer.checklist, [])
  await assert.rejects(loadDrawer(client, HR, 'act-nope'), hasStatus(404))
})

test('syncChecklist on an unknown hire is a 404', ACADEMY_DB_TEST, async () => {
  await assert.rejects(syncChecklist(prisma, 'act-nope'), hasStatus(404))
})

test('unlockModule opens a locked row, the hire can load it, and the card shows AVAILABLE', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const slug = SLUGS[5]
  const locked = await progressRow(slug)
  assert.equal(locked.status, 'LOCKED')
  await assert.rejects(loadModule(prisma, HIRE_ID, slug), hasStatus(403))

  await unlockModule(prisma, NEW_HIRE_ID, locked.moduleId, P.hr.id)
  const row = await progressRow(slug)
  assert.equal(row.status, 'IN_PROGRESS')
  assert.equal(row.unlockedEarlyById, P.hr.id)

  const home = await loadHome(prisma, HIRE_ID)
  assert.ok(home.released)
  assert.equal(home.phases.flatMap((p) => p.modules).find((c) => c.slug === slug)?.status, 'AVAILABLE')
  assert.equal((await loadModule(prisma, HIRE_ID, slug)).slug, slug)
})

test('unlockModule: 409 before release, and only a course row can be opened', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const row = await progressRow(SLUGS[5])
  await prisma.onboardingProgress.update({ where: { id: row.id }, data: { source: 'SINGLE_ASSIGNMENT' } })
  await assert.rejects(unlockModule(prisma, NEW_HIRE_ID, row.moduleId, P.hr.id), hasStatus(404))
  const after = await progressRow(SLUGS[5])
  assert.equal(after.status, 'LOCKED')
  assert.equal(after.unlockedEarlyById, null)

  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { academyReleasedAt: null } })
  await assert.rejects(
    unlockModule(prisma, NEW_HIRE_ID, row.moduleId, P.hr.id),
    (e: unknown) => e instanceof AcademyError && e.status === 409 && e.message === "This hire's course hasn't been released yet.",
  )
})

test('unlockModule leaves a finished row alone and refuses an unknown module', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await scrollAndComplete(SLUGS[0])
  const done = await progressRow(SLUGS[0])
  await unlockModule(prisma, NEW_HIRE_ID, done.moduleId, P.hr.id)
  const row = await progressRow(SLUGS[0])
  assert.equal(row.status, 'COMPLETED')
  assert.equal(row.unlockedEarlyById, null)
  await assert.rejects(unlockModule(prisma, NEW_HIRE_ID, 'act-nope', P.hr.id), hasStatus(404))
  await assert.rejects(unlockModule(prisma, 'act-nope', done.moduleId, P.hr.id), hasStatus(404))
})

test('verifyLinkedin saves the URL and the next sync ticks linkedin-update', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openLinkedinModule()
  await prisma.user.update({ where: { id: HIRE_ID }, data: { linkedinUrl: 'https://www.linkedin.com/in/cara-old-profile' } })
  await syncChecklist(prisma, NEW_HIRE_ID)
  assert.equal((await itemFor('linkedin-update')).doneAt, null)
  const before = (await loadDrawer(prisma, HR, NEW_HIRE_ID)).linkedin
  assert.deepEqual({ url: before.url, profileUrl: before.profileUrl, verified: before.verified }, { url: LINKEDIN, profileUrl: 'https://www.linkedin.com/in/cara-old-profile', verified: false })

  await verifyLinkedin(prisma, NEW_HIRE_ID, P.hr.id)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: HIRE_ID }, select: { linkedinUrl: true } })
  assert.equal(user.linkedinUrl, LINKEDIN)
  const hire = await prisma.newHire.findUniqueOrThrow({ where: { id: NEW_HIRE_ID } })
  assert.ok(hire.linkedinVerifiedAt)

  await syncChecklist(prisma, NEW_HIRE_ID)
  assert.ok((await itemFor('linkedin-update')).doneAt)
  const drawer = await loadDrawer(prisma, HR, NEW_HIRE_ID)
  assert.deepEqual({ url: drawer.linkedin.url, profileUrl: drawer.linkedin.profileUrl, verified: drawer.linkedin.verified }, { url: LINKEDIN, profileUrl: LINKEDIN, verified: true })
})

test('verifying an already verified URL changes nothing; a changed URL can be verified again', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await openLinkedinModule()
  await verifyLinkedin(prisma, NEW_HIRE_ID, P.hr.id)
  const first = await prisma.newHire.findUniqueOrThrow({ where: { id: NEW_HIRE_ID } })
  await verifyLinkedin(prisma, NEW_HIRE_ID, P.hr.id)
  const second = await prisma.newHire.findUniqueOrThrow({ where: { id: NEW_HIRE_ID } })
  assert.equal(second.linkedinVerifiedAt?.getTime(), first.linkedinVerifiedAt?.getTime())

  const changed = 'https://www.linkedin.com/in/cara-l'
  await saveLinkedinUrl(prisma, HIRE_ID, changed)
  assert.equal((await loadDrawer(prisma, HR, NEW_HIRE_ID)).linkedin.verified, false)
  await verifyLinkedin(prisma, NEW_HIRE_ID, P.hr.id)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: HIRE_ID }, select: { linkedinUrl: true } })
  assert.equal(user.linkedinUrl, changed)
})

test('verifyLinkedin: an unset or invalid URL is a 400, and nothing is written', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await assert.rejects(verifyLinkedin(prisma, NEW_HIRE_ID, P.hr.id), hasStatus(400))
  await cleanCourse()

  await createReleasedHire()
  await assert.rejects(verifyLinkedin(prisma, NEW_HIRE_ID, P.hr.id), hasStatus(400))
  const row = await openLinkedinModule(null)
  await prisma.onboardingProgress.update({
    where: { id: row.id },
    data: { state: { checks: {}, linksOpenedAt: {}, scrolledToEnd: false, linkedinUrl: 'https://evil.example.test/in/cara' } },
  })
  await assert.rejects(verifyLinkedin(prisma, NEW_HIRE_ID, P.hr.id), hasStatus(400))
  assert.equal((await prisma.newHire.findUniqueOrThrow({ where: { id: NEW_HIRE_ID } })).linkedinVerifiedAt, null)
  assert.equal((await loadDrawer(prisma, HR, NEW_HIRE_ID)).linkedin.url, null, 'a bad stored link never reaches a page')
  await assert.rejects(verifyLinkedin(prisma, 'act-nope', P.hr.id), hasStatus(404))
})

test('the drawer: modules with versions and dates, wrong questions, acknowledgements, checklist states', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await scrollAndComplete(SLUGS[0])
  const question = await prisma.onboardingQuizQuestion.findFirstOrThrow({ where: { isActive: true } })
  await prisma.quizAttempt.create({
    data: attempt({
      score: 1, totalQuestions: 3, passed: false,
      answersJson: [
        { questionId: question.id, chosen: 'wrong', correct: false, correctAnswer: question.correctAnswer },
        { questionId: 'act-gone', chosen: 'also wrong', correct: false, correctAnswer: 'right' },
        { questionId: 'act-right', chosen: 'right', correct: true, correctAnswer: 'right' },
      ],
    }),
  })
  await prisma.onboardingAcknowledgement.create({
    data: { userId: HIRE_ID, kind: 'SECURITY_SOPS', statementText: 'I will follow the rules.', typedName: P.hire.name },
  })

  const drawer = await loadDrawer(prisma, HR, NEW_HIRE_ID)
  assert.equal(drawer.newHireId, NEW_HIRE_ID)
  assert.equal(drawer.userId, HIRE_ID)
  assert.equal(drawer.modules.length, 14)
  const [first, second, third] = drawer.modules
  assert.equal(first.status, 'COMPLETED')
  assert.equal(first.version, 1)
  assert.ok(first.completedAt)
  assert.ok(first.dueAt)
  assert.equal(first.unlockable, false)
  assert.equal(second.status, 'AVAILABLE')
  assert.equal(third.status, 'LOCKED')
  assert.equal(third.unlockable, true)

  assert.equal(drawer.quizAttempts.length, 1)
  const [quiz] = drawer.quizAttempts
  assert.equal(quiz.score, 1)
  assert.equal(quiz.total, 3)
  assert.equal(quiz.passed, false)
  assert.deepEqual(quiz.wrongQuestions.map((w) => w.chosen), ['wrong', 'also wrong'])
  assert.equal(quiz.wrongQuestions[0].question, question.questionText)
  assert.equal(quiz.wrongQuestions[0].correctAnswer, question.correctAnswer)
  assert.equal(quiz.wrongQuestions[1].question, 'This question is no longer in the quiz.')

  assert.deepEqual(drawer.acknowledgements.map((a) => [a.kind, a.typedName]), [['SECURITY_SOPS', P.hire.name]])
  assert.equal(drawer.checklist.length, 17)
  assert.ok(drawer.checklist.every((item) => typeof item.state === 'string' && typeof item.dueAt === 'string'))
  assert.equal(drawer.checklist[0].key, 'contract-signed', 'in template order')
  assert.deepEqual(JSON.parse(JSON.stringify(drawer)), drawer, 'JSON-safe')
})

test('the drawer shows payment masked, with the last change time and no plain value', ACADEMY_DB_TEST, async () => {
  await createReleasedHire({ attributes: CONTRACTOR_ATTRIBUTES })
  await openPaymentModule()
  await savePayout(prisma, HIRE_ID, WISE)
  const { payment } = await loadDrawer(prisma, HR, NEW_HIRE_ID)
  assert.ok(payment)
  assert.equal(payment.method, 'WISE')
  assert.equal(payment.fields.payoutEmail, 'c***@example.test')
  assert.ok(payment.lastChangedAt)
  assert.equal(payment.unreadable, false)
  assert.equal(await prisma.onboardingPaymentRevealLog.count({ where: { paymentUserId: HIRE_ID } }), 0, 'masked reads are not reveals')
})

test('a payment row that cannot be read does not take the drawer down', ACADEMY_DB_TEST, async () => {
  await createReleasedHire({ attributes: CONTRACTOR_ATTRIBUTES })
  await openPaymentModule()
  await savePayout(prisma, HIRE_ID, WISE)
  await prisma.onboardingPaymentDetails.update({ where: { userId: HIRE_ID }, data: { payoutEmail: 'p21enc:v1:not-really' } })
  const { payment, checklist } = await loadDrawer(prisma, HR, NEW_HIRE_ID)
  assert.equal(payment?.unreadable, true)
  assert.equal(payment?.method, 'WISE')
  assert.deepEqual(payment?.fields, {})
  assert.equal(checklist.length, 17)
})

test('a payment save writes one log row with no value; isFirstSave true then false', ACADEMY_DB_TEST, async () => {
  await createReleasedHire({ attributes: CONTRACTOR_ATTRIBUTES })
  await openPaymentModule()
  assert.deepEqual(await savePayout(prisma, HIRE_ID, WISE), { isUpdate: false })
  assert.deepEqual(await savePayout(prisma, HIRE_ID, { ...WISE, method: 'PAYONEER' }), { isUpdate: true })
  const logs = await prisma.onboardingPaymentChangeLog.findMany({ where: { userId: HIRE_ID }, orderBy: { createdAt: 'asc' } })
  assert.deepEqual(logs.map((l) => [l.method, l.isFirstSave, l.actorId]), [['WISE', true, HIRE_ID], ['PAYONEER', false, HIRE_ID]])
  assert.deepEqual(Object.keys(logs[0]).sort(), ['actorId', 'createdAt', 'id', 'isFirstSave', 'method', 'userId'])
  assert.equal(JSON.stringify(logs).includes('example.test'), false)
})

test('a bank save logs too, and a refused save logs nothing', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await assert.rejects(saveBankDetails(prisma, HIRE_ID, BANK), hasStatus(403))
  await assert.rejects(savePayout(prisma, HIRE_ID, WISE), hasStatus(400))
  assert.equal(await prisma.onboardingPaymentChangeLog.count({ where: { userId: HIRE_ID } }), 0)

  const bank = await progressRow('getting-paid')
  await prisma.onboardingProgress.update({ where: { id: bank.id }, data: { status: 'IN_PROGRESS' } })
  await saveBankDetails(prisma, HIRE_ID, BANK)
  await saveBankDetails(prisma, HIRE_ID, BANK)
  const logs = await prisma.onboardingPaymentChangeLog.findMany({ where: { userId: HIRE_ID }, orderBy: { createdAt: 'asc' } })
  assert.deepEqual(logs.map((l) => [l.method, l.isFirstSave]), [['PK_BANK', true], ['PK_BANK', false]])
  assert.equal(JSON.stringify(logs).includes(BANK.iban), false)
})

test('tickChecklistItem: each role only its own items, the assigned lead only theirs', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await prisma.user.create({ data: { ...P.oa, onboardingCompleted: true } })
  await syncChecklist(prisma, NEW_HIRE_ID, new Date('2026-11-01T00:00:00.000Z'))
  const when = new Date('2026-11-02T00:00:00.000Z')

  const hrItem = await itemFor('contract-signed')
  for (const viewer of [OA, SECURITY, LEAD, EMPLOYEE]) {
    await assert.rejects(tickChecklistItem(prisma, viewer, hrItem.id, { done: true }, when), hasStatus(403))
  }
  assert.equal((await itemFor('contract-signed')).doneAt, null)
  assert.equal((await tickChecklistItem(prisma, HR, hrItem.id, { done: true }, when)).doneById, P.hr.id)

  const oaItem = await itemFor('payment-setup')
  assert.equal((await tickChecklistItem(prisma, OA, oaItem.id, { done: true }, when)).doneById, P.oa.id)
  const securityItem = await itemFor('equipment-ready')
  await assert.rejects(tickChecklistItem(prisma, OA, securityItem.id, { done: true }, when), hasStatus(403))

  const leadItem = await itemFor('team-call')
  await assert.rejects(tickChecklistItem(prisma, EMPLOYEE, leadItem.id, { done: true }, when), hasStatus(403))
  assert.equal((await tickChecklistItem(prisma, LEAD, leadItem.id, { done: true }, when)).doneById, P.lead.id)

  await assert.rejects(tickChecklistItem(prisma, HR, 'act-nope', { done: true }, when), hasStatus(404))
})

test('a lead whose role is SECURITY ticks their own hire, never another hire', ACADEMY_DB_TEST, async () => {
  await createReadyHire()
  await prisma.user.update({ where: { id: P.lead.id }, data: { role: 'SECURITY' } })
  await extraHire('other', { teamLeadId: P.buddy.id })
  const when = new Date('2026-11-02T00:00:00.000Z')
  await syncChecklists(prisma, [NEW_HIRE_ID, 'act-other'], new Date('2026-11-01T00:00:00.000Z'))
  const viewer = { id: P.lead.id, role: 'SECURITY' }

  const own = await itemFor('team-call')
  assert.equal((await tickChecklistItem(prisma, viewer, own.id, { done: true }, when)).doneById, P.lead.id)
  const other = await itemFor('team-call', 'act-other')
  await assert.rejects(tickChecklistItem(prisma, viewer, other.id, { done: true }, when), hasStatus(403))
  assert.equal((await itemFor('team-call', 'act-other')).doneAt, null)
})

test('clearHireQuiz clears through the hire; a hire with no account or a finished one is refused', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await prisma.quizAttempt.create({ data: attempt({ passed: false }) })
  await clearHireQuiz(prisma, NEW_HIRE_ID, P.hr.id)
  assert.equal(await prisma.quizAttempt.count({ where: { userId: HIRE_ID } }), 0)

  await extraHire('nouser')
  await assert.rejects(clearHireQuiz(prisma, 'act-nouser', P.hr.id), hasStatus(404))
  await assert.rejects(clearHireQuiz(prisma, 'act-nope', P.hr.id), hasStatus(404))
  await prisma.user.update({ where: { id: HIRE_ID }, data: { onboardingCompleted: true } })
  await assert.rejects(clearHireQuiz(prisma, NEW_HIRE_ID, P.hr.id), hasStatus(409))
})

test('loadAcknowledgementRows gives the export rows, dated in the hire\'s own zone', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await prisma.onboardingAcknowledgement.create({
    data: {
      userId: HIRE_ID, kind: 'SECURITY_SOPS', statementText: 'I will follow the rules.', typedName: P.hire.name,
      signedAt: new Date('2026-12-04T20:00:00.000Z'),
    },
  })
  const [row, ...rest] = await loadAcknowledgementRows(prisma, HR, NEW_HIRE_ID)
  assert.equal(rest.length, 0)
  assert.equal(row.name, P.hire.name)
  assert.equal(row.email, P.hire.email)
  assert.equal(row.kind, 'SECURITY_SOPS')
  assert.equal(row.statementText, 'I will follow the rules.')
  assert.equal(row.signedOn, '5 December 2026', 'Karachi is already on the next day')
  await extraHire('nouser')
  assert.deepEqual(await loadAcknowledgementRows(prisma, HR, 'act-nouser'), [])
  await assert.rejects(loadAcknowledgementRows(prisma, HR, 'act-nope'), hasStatus(404))
})
