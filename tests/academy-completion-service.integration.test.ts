import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { AcademyError } from '../lib/academy/errors'
import { VALUES_STATEMENT, type Submission } from '../lib/academy/quiz'
import { finishCourseIfDone, loadCompletion, notifyCourseCompleted, signValuesAcknowledgement } from '../lib/academy/service/completion'
import { signAcknowledgement } from '../lib/academy/service/fields'
import { lockUserRow, submitQuiz } from '../lib/academy/service/quiz'
import { ACADEMY_QUIZ_QUESTIONS } from '../prisma/seed-academy-quiz'
import { ACADEMY_DB_TEST, P } from './helpers/academy-test-db'
import { HIRE_ID, NEW_HIRE_ID, cleanCourse, createReadyHire, createReleasedHire } from './helpers/academy-course-fixtures'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'

const BANK_TEXTS = ACADEMY_QUIZ_QUESTIONS.map((q) => q.questionText)
const NAME_ERROR = /^Type your full name as it appears at the top of this page\.$/
const NO_PASS_ERROR = /^Pass the culture quiz first\.$/
const NAME = P.hire.name
const LOCK_HOLD_MS = 500

const fails = (status: number, message: RegExp) => (error: unknown) => {
  assert.ok(error instanceof AcademyError, String(error))
  assert.equal(error.status, status)
  assert.match(error.message, message)
  return true
}

const clearBank = () => prisma.onboardingQuizQuestion.deleteMany({ where: { questionText: { in: BANK_TEXTS } } })

after(async () => {
  if (WEEKLY_DB_READY) {
    await cleanCourse()
    await clearBank()
  }
  await prisma.$disconnect()
})

const finishModules = () =>
  prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID }, data: { status: 'COMPLETED', completedAt: new Date() } })

const usableQuestions = () =>
  prisma.onboardingQuizQuestion.findMany({ where: { isActive: true, retiredAt: null, explanation: { not: null } } })

async function allCorrect(): Promise<Submission> {
  return { answers: (await usableQuestions()).map((q) => ({ questionId: q.id, chosen: q.correctAnswer })) }
}

async function allWrong(): Promise<Submission> {
  return {
    answers: (await usableQuestions()).map((q) => ({
      questionId: q.id,
      chosen: (q.optionsJson as string[]).find((option) => option !== q.correctAnswer) as string,
    })),
  }
}

/** Every module done and nothing else: no pass and no signature. */
async function modulesDone(): Promise<void> {
  await clearBank()
  await createReleasedHire()
  await finishModules()
}

const pass = async () => submitQuiz(prisma, HIRE_ID, await allCorrect())
const signSecurity = () => signAcknowledgement(prisma, HIRE_ID, { kind: 'SECURITY_SOPS', typedName: NAME, moduleSlug: 'security' })

async function passedAndSecuritySigned(): Promise<void> {
  await modulesDone()
  await pass()
  await signSecurity()
}

const valuesRows = () => prisma.onboardingAcknowledgement.findMany({ where: { userId: HIRE_ID, kind: 'VALUES_CODE_OF_CONDUCT' } })
const hire = () => prisma.user.findUniqueOrThrow({ where: { id: HIRE_ID }, select: { onboardingCompleted: true } })
const newHire = () => prisma.newHire.findUniqueOrThrow({ where: { id: NEW_HIRE_ID }, select: { status: true } })

async function assertStillLocked(): Promise<void> {
  assert.equal((await hire()).onboardingCompleted, false)
  assert.notEqual((await newHire()).status, 'COMPLETED')
}

const finishDirectly = () => prisma.$transaction((tx) => finishCourseIfDone(tx, HIRE_ID))

const addValuesRow = (signedAt?: Date) =>
  prisma.onboardingAcknowledgement.create({
    data: { userId: HIRE_ID, kind: 'VALUES_CODE_OF_CONDUCT', statementText: VALUES_STATEMENT, typedName: NAME, signedAt },
  })

test('signing with no pass is 403 and writes no row', ACADEMY_DB_TEST, async () => {
  await modulesDone()
  await assert.rejects(signValuesAcknowledgement(prisma, HIRE_ID, NAME), fails(403, NO_PASS_ERROR))
  assert.equal((await valuesRows()).length, 0)
})

test('a failed attempt is not a pass', ACADEMY_DB_TEST, async () => {
  await modulesDone()
  await submitQuiz(prisma, HIRE_ID, await allWrong())
  await assert.rejects(signValuesAcknowledgement(prisma, HIRE_ID, NAME), fails(403, NO_PASS_ERROR))
})

test('a legacy pass does not count', ACADEMY_DB_TEST, async () => {
  await modulesDone()
  await prisma.quizAttempt.create({
    data: { userId: HIRE_ID, score: 5, totalQuestions: 5, passed: true, answersJson: { q1: 'a', q2: 'b' } },
  })
  await assert.rejects(signValuesAcknowledgement(prisma, HIRE_ID, NAME), fails(403, NO_PASS_ERROR))
  assert.equal((await valuesRows()).length, 0)
})

test('a wrong or empty name gives the Security name message and no row', ACADEMY_DB_TEST, async () => {
  await passedAndSecuritySigned()
  await assert.rejects(signValuesAcknowledgement(prisma, HIRE_ID, 'Someone Else'), fails(400, NAME_ERROR))
  await assert.rejects(signValuesAcknowledgement(prisma, HIRE_ID, '   '), fails(400, NAME_ERROR))
  assert.equal((await valuesRows()).length, 0)
  await assertStillLocked()
})

test('an unknown user is 404', ACADEMY_DB_TEST, async () => {
  await assert.rejects(signValuesAcknowledgement(prisma, 'act-nobody', NAME), fails(404, /./))
})

test('the last signature completes the course and lifts the lockout', ACADEMY_DB_TEST, async () => {
  await passedAndSecuritySigned()
  const benefits = await prisma.benefit.count()
  const { completed, signedAt } = await signValuesAcknowledgement(prisma, HIRE_ID, ' cara  LINDQVIST ')
  assert.equal(completed, true)
  assert.equal((await hire()).onboardingCompleted, true)
  assert.equal((await newHire()).status, 'COMPLETED')
  assert.equal(await prisma.benefit.count(), benefits)

  const [row] = await valuesRows()
  assert.equal(row.statementText, VALUES_STATEMENT)
  assert.equal(row.moduleVersionId, null)
  assert.equal(row.typedName, NAME)
  assert.equal(row.signedAt.getTime(), signedAt.getTime())
})

test('with Security unsigned the values row is saved but the hire stays locked', ACADEMY_DB_TEST, async () => {
  await modulesDone()
  await pass()
  const { completed } = await signValuesAcknowledgement(prisma, HIRE_ID, NAME)
  assert.equal(completed, false)
  assert.equal((await valuesRows()).length, 1)
  await assertStillLocked()
})

test('signing again keeps the first row and retries a finish that was not possible the first time', ACADEMY_DB_TEST, async () => {
  await modulesDone()
  await pass()
  const first = await signValuesAcknowledgement(prisma, HIRE_ID, NAME)
  assert.equal(first.completed, false)
  await signSecurity()
  const second = await signValuesAcknowledgement(prisma, HIRE_ID, NAME)
  assert.equal(second.completed, true)
  assert.equal(second.signedAt.getTime(), first.signedAt.getTime())
})

test('signing twice: one row, the first signedAt, and the second call is not completed', ACADEMY_DB_TEST, async () => {
  await passedAndSecuritySigned()
  const first = await signValuesAcknowledgement(prisma, HIRE_ID, NAME)
  const second = await signValuesAcknowledgement(prisma, HIRE_ID, NAME)
  assert.equal(first.completed, true)
  assert.equal(second.completed, false)
  assert.equal(second.signedAt.getTime(), first.signedAt.getTime())
  assert.equal((await valuesRows()).length, 1)
})

test('two concurrent signatures: one row and exactly one completed', ACADEMY_DB_TEST, async () => {
  await passedAndSecuritySigned()
  const results = await Promise.all([
    signValuesAcknowledgement(prisma, HIRE_ID, NAME),
    signValuesAcknowledgement(prisma, HIRE_ID, NAME),
  ])
  assert.equal(results.filter((r) => r.completed).length, 1)
  assert.equal((await valuesRows()).length, 1)
  assert.equal(results[0].signedAt.getTime(), results[1].signedAt.getTime())
})

test('a signature waits on the user lock, then keeps the row the lock holder committed', ACADEMY_DB_TEST, async () => {
  await passedAndSecuritySigned()
  const held = new Date('2026-12-04T09:00:00.000Z')
  const { pending } = await prisma.$transaction(async (tx) => {
    await lockUserRow(tx, HIRE_ID)
    const pending = signValuesAcknowledgement(prisma, HIRE_ID, NAME).then((result) => result)
    await new Promise((resolve) => setTimeout(resolve, LOCK_HOLD_MS))
    await tx.onboardingAcknowledgement.create({
      data: { userId: HIRE_ID, kind: 'VALUES_CODE_OF_CONDUCT', statementText: VALUES_STATEMENT, typedName: NAME, signedAt: held },
    })
    // Wrapped: returning the promise itself would hold the transaction open on the very wait it causes.
    return { pending }
  })
  const { signedAt, completed } = await pending
  assert.equal(signedAt.getTime(), held.getTime())
  assert.equal(completed, true)
  assert.equal((await valuesRows()).length, 1)
})

test('finishCourseIfDone: one open module holds it back', ACADEMY_DB_TEST, async () => {
  await passedAndSecuritySigned()
  await addValuesRow()
  await prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID, module: { slug: 'welcome' } }, data: { status: 'IN_PROGRESS' } })
  assert.equal(await finishDirectly(), false)
  await assertStillLocked()
})

test('finishCourseIfDone: a completed row that is not a course row does not count', ACADEMY_DB_TEST, async () => {
  await passedAndSecuritySigned()
  await addValuesRow()
  await prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID, module: { slug: 'welcome' } }, data: { source: 'SINGLE_ASSIGNMENT' } })
  assert.equal(await finishDirectly(), false)
  await assertStillLocked()
})

test('finishCourseIfDone: a missing row holds it back', ACADEMY_DB_TEST, async () => {
  await passedAndSecuritySigned()
  await addValuesRow()
  await prisma.onboardingProgress.deleteMany({ where: { userId: HIRE_ID, module: { slug: 'welcome' } } })
  assert.equal(await finishDirectly(), false)
  await assertStillLocked()
})

test('finishCourseIfDone: no pass holds it back, even with both signatures', ACADEMY_DB_TEST, async () => {
  await modulesDone()
  await signSecurity()
  await addValuesRow()
  assert.equal(await finishDirectly(), false)
  await assertStillLocked()
})

test('finishCourseIfDone: the values signature is required', ACADEMY_DB_TEST, async () => {
  await passedAndSecuritySigned()
  assert.equal(await finishDirectly(), false)
  await assertStillLocked()
})

test('finishCourseIfDone: true once, then false', ACADEMY_DB_TEST, async () => {
  await passedAndSecuritySigned()
  await addValuesRow()
  assert.equal(await finishDirectly(), true)
  assert.equal(await finishDirectly(), false)
})

test('loadCompletion is null until the course is complete, then gives the first signature', ACADEMY_DB_TEST, async () => {
  await passedAndSecuritySigned()
  assert.equal(await loadCompletion(prisma, HIRE_ID), null)
  const { signedAt } = await signValuesAcknowledgement(prisma, HIRE_ID, NAME)
  await addValuesRow(new Date(signedAt.getTime() + 60_000))
  assert.deepEqual(await loadCompletion(prisma, HIRE_ID), {
    name: NAME, preferredName: 'Cara', completedAt: signedAt.toISOString(),
  })
})

test('loadCompletion shows the name when no preferred name is set', ACADEMY_DB_TEST, async () => {
  await passedAndSecuritySigned()
  await signValuesAcknowledgement(prisma, HIRE_ID, NAME)
  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { preferredName: null } })
  assert.equal((await loadCompletion(prisma, HIRE_ID))?.preferredName, NAME)
})

test('loadCompletion is null for an existing employee with no course', ACADEMY_DB_TEST, async () => {
  await clearBank()
  await createReadyHire()
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: P.staff.id } })).onboardingCompleted, true)
  assert.equal(await loadCompletion(prisma, P.staff.id), null)
})

test('loadCompletion is null for an unknown user', ACADEMY_DB_TEST, async () => {
  assert.equal(await loadCompletion(prisma, 'act-nobody'), null)
})

async function quietly(run: () => Promise<void>): Promise<unknown[][]> {
  const logged: unknown[][] = []
  const original = console.error
  console.error = (...args: unknown[]) => { logged.push(args) }
  try {
    await run()
  } finally {
    console.error = original
  }
  return logged
}

test('a failed completion email is logged with the user id and never throws', async () => {
  const thrown = await quietly(() => notifyCourseCompleted('user-1', async () => { throw new Error('smtp down') }))
  assert.deepEqual(thrown[0][1], { userId: 'user-1' })
  const undelivered = await quietly(() => notifyCourseCompleted('user-1', async () => ({ success: false })))
  assert.deepEqual(undelivered[0][1], { userId: 'user-1' })
})

test('a delivered completion email logs nothing', async () => {
  const sent: string[] = []
  const logged = await quietly(() => notifyCourseCompleted('user-1', async (userId) => {
    sent.push(userId)
    return { success: true }
  }))
  assert.deepEqual(sent, ['user-1'])
  assert.equal(logged.length, 0)
})
