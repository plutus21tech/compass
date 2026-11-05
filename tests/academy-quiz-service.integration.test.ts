import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { AcademyError } from '../lib/academy/errors'
import { VALUES_STATEMENT, type Submission } from '../lib/academy/quiz'
import { loadHome } from '../lib/academy/service/course'
import { clearQuizAttempts, loadQuiz, lockUserRow, notifyQuizFailAlert, submitQuiz } from '../lib/academy/service/quiz'
import { callTimeLabel } from '../lib/academy/view-labels'
import { ACADEMY_QUIZ_QUESTIONS } from '../prisma/seed-academy-quiz'
import { ACADEMY_DB_TEST, P } from './helpers/academy-test-db'
import { HIRE_ID, NEW_HIRE_ID, cleanCourse, createReadyHire, createReleasedHire } from './helpers/academy-course-fixtures'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'

const BANK_TEXTS = ACADEMY_QUIZ_QUESTIONS.map((q) => q.questionText)
const LOCK_HOLD_MS = 500
const UPDATED = /^The quiz has been updated\. Please start again\.$/

const fails = (status: number, message?: RegExp) => (error: unknown) => {
  assert.ok(error instanceof AcademyError, String(error))
  assert.equal(error.status, status)
  if (message) assert.match(error.message, message)
  return true
}

const clearBank = () => prisma.onboardingQuizQuestion.deleteMany({ where: { questionText: { in: BANK_TEXTS } } })

/** A released hire and a clean bank: a test that retires a question must not leak into the next. */
async function releasedHire(): Promise<void> {
  await clearBank()
  await createReleasedHire()
}

const finishModules = () =>
  prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID }, data: { status: 'COMPLETED', completedAt: new Date() } })

async function readyHire(): Promise<void> {
  await releasedHire()
  await finishModules()
}

after(async () => {
  if (WEEKLY_DB_READY) {
    await cleanCourse()
    await clearBank()
  }
  await prisma.$disconnect()
})

/** Answers `wrong` questions wrongly, in the order the bank comes back. */
async function answers(wrong: number): Promise<Submission> {
  const questions = await prisma.onboardingQuizQuestion.findMany({ where: { questionText: { in: BANK_TEXTS } } })
  return {
    answers: questions.map((q, i) => {
      const options = q.optionsJson as string[]
      return { questionId: q.id, chosen: i < wrong ? (options.find((o) => o !== q.correctAnswer) as string) : q.correctAnswer }
    }),
  }
}

const attempts = () => prisma.quizAttempt.count({ where: { userId: HIRE_ID } })

/** Moves every attempt back to the end of the 15-minute wait. */
const endCooldown = () =>
  prisma.quizAttempt.updateMany({ where: { userId: HIRE_ID }, data: { createdAt: new Date(Date.now() - 15 * 60_000) } })

const signValues = () =>
  prisma.onboardingAcknowledgement.create({
    data: { userId: HIRE_ID, kind: 'VALUES_CODE_OF_CONDUCT', statementText: VALUES_STATEMENT, typedName: P.hire.name },
  })

const hireStatus = async () =>
  (await prisma.newHire.findUniqueOrThrow({ where: { id: NEW_HIRE_ID }, select: { status: true } })).status

test('no released course: GET and POST are both 404', ACADEMY_DB_TEST, async () => {
  await clearBank()
  await createReadyHire()
  await assert.rejects(loadQuiz(prisma, HIRE_ID), fails(404))
  await assert.rejects(submitQuiz(prisma, HIRE_ID, await answers(0)), fails(404))
  assert.equal(await attempts(), 0)
})

test('modules unfinished: GET gives LOCKED with no paper; POST gives 403', ACADEMY_DB_TEST, async () => {
  await releasedHire()
  const view = await loadQuiz(prisma, HIRE_ID)
  assert.equal(view.status, 'LOCKED')
  assert.equal(view.paper, null)
  assert.equal(view.lastResult, null)
  await assert.rejects(submitQuiz(prisma, HIRE_ID, await answers(0)), fails(403, /^Finish all 14 modules first\.$/))
  assert.equal(await attempts(), 0)
})

test('one active module still open keeps the quiz LOCKED', ACADEMY_DB_TEST, async () => {
  await readyHire()
  await prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID, module: { slug: 'welcome' } }, data: { status: 'IN_PROGRESS' } })
  assert.equal((await loadQuiz(prisma, HIRE_ID)).status, 'LOCKED')
})

test('GET in READY carries the paper and no answer key, explanation or value', ACADEMY_DB_TEST, async () => {
  await readyHire()
  const view = await loadQuiz(prisma, HIRE_ID)
  assert.equal(view.status, 'READY')
  assert.equal(view.paper?.questions.length, 12)
  assert.equal(view.lastResult, null)
  assert.equal(view.retakeAt, null)
  assert.equal(view.failedCount, 0)
  const json = JSON.stringify(view)
  assert.doesNotMatch(json, /"correctAnswer"/)
  assert.doesNotMatch(json, /"explanation"/)
  assert.doesNotMatch(json, /"valueKey"/)
  for (const q of ACADEMY_QUIZ_QUESTIONS) assert.equal(json.includes(q.explanation), false, q.explanation)
})

test('a pass stores 12 answer rows and returns the full review', ACADEMY_DB_TEST, async () => {
  await readyHire()
  const { result, failAlertDue } = await submitQuiz(prisma, HIRE_ID, await answers(2))
  assert.equal(failAlertDue, false)
  assert.deepEqual([result.score, result.total, result.passed, result.passPercent], [10, 12, true, 80])
  assert.equal(result.review.length, 12)
  for (const row of result.review) assert.ok(row.explanation.length > 0, row.question)
  assert.equal(result.review.filter((r) => r.correct).length, 10)

  const attempt = await prisma.quizAttempt.findFirstOrThrow({ where: { userId: HIRE_ID } })
  assert.deepEqual([attempt.score, attempt.totalQuestions, attempt.passed], [10, 12, true])
  const rows = attempt.answersJson as Array<Record<string, unknown>>
  assert.equal(rows.length, 12)
  rows.forEach((row, i) => {
    assert.equal(typeof row.chosen, 'string')
    assert.equal(typeof row.correct, 'boolean')
    assert.equal(row.shownIndex, i)
  })
  const view = await loadQuiz(prisma, HIRE_ID)
  assert.equal(view.status, 'PASSED_UNSIGNED')
  assert.equal(view.paper, null)
  assert.deepEqual(view.lastResult, result)
})

test('after a pass a second submission is refused; DONE once the values are signed', ACADEMY_DB_TEST, async () => {
  await readyHire()
  await submitQuiz(prisma, HIRE_ID, await answers(0))
  await assert.rejects(submitQuiz(prisma, HIRE_ID, await answers(0)), fails(409, /^You've already passed\.$/))
  await signValues()
  assert.equal((await loadQuiz(prisma, HIRE_ID)).status, 'DONE')
  await assert.rejects(submitQuiz(prisma, HIRE_ID, await answers(0)), fails(409, /^You've already passed\.$/))
  assert.equal(await attempts(), 1)
})

test('after a failure the cooldown holds, says when in the hire zone, and ends after 15 minutes', ACADEMY_DB_TEST, async () => {
  await readyHire()
  const { result } = await submitQuiz(prisma, HIRE_ID, await answers(3))
  assert.deepEqual([result.score, result.passed], [9, false])

  const view = await loadQuiz(prisma, HIRE_ID)
  assert.equal(view.status, 'COOLDOWN')
  assert.equal(view.paper, null)
  assert.equal(view.failedCount, 1)
  assert.ok(view.retakeAt)
  const expected = `You can retake the quiz after ${callTimeLabel(view.retakeAt, 'Asia/Karachi')}.`
  await assert.rejects(submitQuiz(prisma, HIRE_ID, await answers(0)), (error: unknown) => {
    assert.ok(error instanceof AcademyError)
    assert.equal(error.status, 409)
    assert.equal(error.message, expected)
    return true
  })
  assert.equal(await attempts(), 1)

  await endCooldown()
  const later = await loadQuiz(prisma, HIRE_ID)
  assert.equal(later.status, 'READY')
  assert.equal(later.paper?.questions.length, 12)
  assert.equal(later.retakeAt, null)
  assert.equal(later.lastResult?.score, 9)
})

test('two concurrent submissions create exactly one attempt; the other gets 409', ACADEMY_DB_TEST, async () => {
  await readyHire()
  const body = await answers(3)
  const settled = await Promise.allSettled([submitQuiz(prisma, HIRE_ID, body), submitQuiz(prisma, HIRE_ID, body)])
  assert.equal(await attempts(), 1)
  assert.equal(settled.filter((s) => s.status === 'fulfilled').length, 1)
  const refused = settled.find((s) => s.status === 'rejected')
  assert.ok(refused?.status === 'rejected')
  fails(409)(refused.reason)
})

// Promise.all can pass by luck: the pool may hand the second transaction its connection after the first is done.
test('a submission waits on the user lock, then judges what the lock holder committed', ACADEMY_DB_TEST, async () => {
  await readyHire()
  const body = await answers(0)
  const { pending } = await prisma.$transaction(async (tx) => {
    await lockUserRow(tx, HIRE_ID)
    const pending = Promise.allSettled([submitQuiz(prisma, HIRE_ID, body)])
    await new Promise((resolve) => setTimeout(resolve, LOCK_HOLD_MS))
    await tx.quizAttempt.create({ data: { userId: HIRE_ID, score: 0, totalQuestions: 12, passed: false, answersJson: [] } })
    // Wrapped: returning the promise itself would hold the transaction open on the very wait it causes.
    return { pending }
  })
  const [outcome] = await pending
  assert.ok(outcome.status === 'rejected')
  fails(409, /^You can retake the quiz after /)(outcome.reason)
  assert.equal(await attempts(), 1)
})

test('the fail alert is due at every multiple of the threshold', ACADEMY_DB_TEST, async () => {
  await readyHire()
  const due: boolean[] = []
  for (let n = 1; n <= 6; n += 1) {
    const { failAlertDue, failedCount } = await submitQuiz(prisma, HIRE_ID, await answers(12))
    assert.equal(failedCount, n)
    due.push(failAlertDue)
    await endCooldown()
  }
  assert.deepEqual(due, [false, false, true, false, false, true])
})

test('a pass at the threshold is not an alert', ACADEMY_DB_TEST, async () => {
  await readyHire()
  for (let n = 0; n < 3; n += 1) {
    await submitQuiz(prisma, HIRE_ID, await answers(12))
    await endCooldown()
  }
  assert.equal((await submitQuiz(prisma, HIRE_ID, await answers(0))).failAlertDue, false)
})

test('a question deactivated between GET and POST gives 409 and saves nothing', ACADEMY_DB_TEST, async () => {
  await readyHire()
  await loadQuiz(prisma, HIRE_ID)
  const body = await answers(0)
  await prisma.onboardingQuizQuestion.update({ where: { id: body.answers[0].questionId }, data: { isActive: false } })
  await assert.rejects(submitQuiz(prisma, HIRE_ID, body), fails(409, UPDATED))
  assert.equal(await attempts(), 0)
})

test('a question retired between GET and POST gives the same 409', ACADEMY_DB_TEST, async () => {
  await readyHire()
  const body = await answers(0)
  await prisma.onboardingQuizQuestion.update({ where: { id: body.answers[0].questionId }, data: { retiredAt: new Date() } })
  await assert.rejects(submitQuiz(prisma, HIRE_ID, body), fails(409, UPDATED))
  assert.equal(await attempts(), 0)
})

test('a chosen answer that is not an option is 400 and saves nothing', ACADEMY_DB_TEST, async () => {
  await readyHire()
  const [first, ...rest] = (await answers(0)).answers
  await assert.rejects(submitQuiz(prisma, HIRE_ID, { answers: [{ ...first, chosen: 'made up' }, ...rest] }), fails(400))
  assert.equal(await attempts(), 0)
})

test('a malformed submission is refused and saves nothing', ACADEMY_DB_TEST, async () => {
  await readyHire()
  await assert.rejects(submitQuiz(prisma, HIRE_ID, { answers: [] }))
  assert.equal(await attempts(), 0)
})

test('a retired question still resolves in lastResult', ACADEMY_DB_TEST, async () => {
  await readyHire()
  const body = await answers(3)
  await submitQuiz(prisma, HIRE_ID, body)
  const retired = await prisma.onboardingQuizQuestion.update({
    where: { id: body.answers[0].questionId }, data: { isActive: false, retiredAt: new Date() },
  })
  const view = await loadQuiz(prisma, HIRE_ID)
  assert.equal(view.lastResult?.review.length, 12)
  assert.ok(view.lastResult?.review.some((r) => r.question === retired.questionText && r.explanation === retired.explanation))
})

test('an attempt from the legacy quiz, stored in the old shape, reads as an empty review', ACADEMY_DB_TEST, async () => {
  await readyHire()
  await prisma.quizAttempt.create({
    data: {
      userId: HIRE_ID, score: 1, totalQuestions: 5, passed: false, answersJson: { 'old-question': 'an answer' },
      createdAt: new Date(Date.now() - 3_600_000),
    },
  })
  const view = await loadQuiz(prisma, HIRE_ID)
  assert.equal(view.status, 'READY')
  assert.deepEqual([view.lastResult?.score, view.lastResult?.total, view.lastResult?.review], [1, 5, []])
})

test('clearQuizAttempts lifts the cooldown and changes nothing else', ACADEMY_DB_TEST, async () => {
  await readyHire()
  await submitQuiz(prisma, HIRE_ID, await answers(12))
  const statusBefore = await hireStatus()
  await clearQuizAttempts(prisma, HIRE_ID)
  assert.equal(await attempts(), 0)
  const view = await loadQuiz(prisma, HIRE_ID)
  assert.equal(view.status, 'READY')
  assert.equal(view.failedCount, 0)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: HIRE_ID }, select: { onboardingCompleted: true } })
  assert.equal(user.onboardingCompleted, false)
  assert.equal(await hireStatus(), statusBefore)
})

test('clearQuizAttempts leaves NewHire.status alone, whatever it was', ACADEMY_DB_TEST, async () => {
  await readyHire()
  await prisma.newHire.update({ where: { id: NEW_HIRE_ID }, data: { status: 'COMPLETED' } })
  await clearQuizAttempts(prisma, HIRE_ID)
  assert.equal(await hireStatus(), 'COMPLETED')
})

test('clearQuizAttempts is refused for someone who finished onboarding, and for an unknown user', ACADEMY_DB_TEST, async () => {
  await readyHire()
  await submitQuiz(prisma, HIRE_ID, await answers(0))
  await prisma.user.update({ where: { id: HIRE_ID }, data: { onboardingCompleted: true } })
  await assert.rejects(clearQuizAttempts(prisma, HIRE_ID), fails(409, /^This person has finished onboarding\.$/))
  assert.equal(await attempts(), 1)
  await assert.rejects(clearQuizAttempts(prisma, 'act-nobody'), fails(404))
})

test('Home carries the quiz: same due date as the course, overdue until DONE', ACADEMY_DB_TEST, async () => {
  await releasedHire()
  const locked = await loadHome(prisma, HIRE_ID)
  assert.ok(locked.released)
  assert.equal(locked.quiz.status, 'LOCKED')
  assert.ok(locked.quiz.dueAt)
  assert.equal(locked.quiz.dueAt, locked.courseDueAt)
  assert.equal((await loadQuiz(prisma, HIRE_ID)).dueAt, locked.courseDueAt)
  assert.equal(locked.quiz.overdue, false)

  await finishModules()
  await prisma.onboardingProgress.updateMany({ where: { userId: HIRE_ID }, data: { dueAt: new Date(Date.now() - 60_000) } })
  await submitQuiz(prisma, HIRE_ID, await answers(12))
  const cooling = await loadHome(prisma, HIRE_ID)
  assert.ok(cooling.released)
  assert.deepEqual([cooling.quiz.status, cooling.quiz.overdue, cooling.quiz.failedCount], ['COOLDOWN', true, 1])
  assert.ok(cooling.quiz.retakeAt)

  await endCooldown()
  await submitQuiz(prisma, HIRE_ID, await answers(0))
  await signValues()
  const done = await loadHome(prisma, HIRE_ID)
  assert.ok(done.released)
  assert.deepEqual([done.quiz.status, done.quiz.overdue, done.quiz.retakeAt], ['DONE', false, null])
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

test('the fail alert goes out with the user and count; an email that throws or fails is only logged', async () => {
  const sent: Array<[string, number]> = []
  await notifyQuizFailAlert('user-1', 3, async (userId, failedCount) => {
    sent.push([userId, failedCount])
    return { success: true }
  })
  assert.deepEqual(sent, [['user-1', 3]])
  const thrown = await quietly(() => notifyQuizFailAlert('user-1', 3, async () => { throw new Error('smtp down') }))
  assert.deepEqual(thrown[0][1], { userId: 'user-1' })
  const undelivered = await quietly(() => notifyQuizFailAlert('user-1', 3, async () => ({ success: false })))
  assert.equal(undelivered.length, 1)
})
