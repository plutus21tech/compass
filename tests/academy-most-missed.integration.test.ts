import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { AcademyError } from '../lib/academy/errors'
import { loadMostMissed } from '../lib/academy/service/most-missed'
import { ACADEMY_DB_TEST, P } from './helpers/academy-test-db'

const HR = { id: P.hr.id, role: 'HR' }
const EMPLOYEE = { id: P.staff.id, role: 'EMPLOYEE' }
const PREFIX = 'Most-missed test: '
const USERS = ['act-mm-1', 'act-mm-2']
const hasStatus = (status: number) => (e: unknown) => e instanceof AcademyError && e.status === status

const row = (questionId: string, correct: boolean) => ({ questionId, chosen: 'x', correct, correctAnswer: 'y' })

async function clean(): Promise<void> {
  if (ACADEMY_DB_TEST.skip) return
  await prisma.quizAttempt.deleteMany({ where: { userId: { in: USERS } } })
  await prisma.onboardingQuizQuestion.deleteMany({ where: { questionText: { startsWith: PREFIX } } })
  await prisma.user.deleteMany({ where: { id: { in: USERS } } })
}

async function seed() {
  for (const id of USERS) {
    await prisma.user.create({ data: { id, name: `Tester ${id}`, role: 'EMPLOYEE', email: `${id}@example.test` } })
  }
  const base = (await prisma.onboardingQuizQuestion.aggregate({ _max: { orderIndex: true } }))._max.orderIndex ?? 0
  const live = await prisma.onboardingQuizQuestion.create({
    data: { questionText: `${PREFIX}live`, optionsJson: ['x', 'y'], correctAnswer: 'y', orderIndex: base + 1, explanation: 'Because.' },
  })
  const retired = await prisma.onboardingQuizQuestion.create({
    data: {
      questionText: `${PREFIX}retired`, optionsJson: ['x', 'y'], correctAnswer: 'y', orderIndex: base + 2,
      isActive: false, retiredAt: new Date(), explanation: 'Because.',
    },
  })
  return { live, retired }
}

beforeEach(clean)
after(async () => {
  await clean()
  await prisma.$disconnect()
})

test('counts Academy attempts only, keeps retired questions, and ignores legacy attempts', ACADEMY_DB_TEST, async () => {
  const { live, retired } = await seed()
  const day = (n: number) => new Date(Date.UTC(2026, 10, n))
  await prisma.quizAttempt.createMany({
    data: [
      { userId: 'act-mm-1', score: 0, totalQuestions: 2, passed: false, createdAt: day(1), answersJson: [row(live.id, false), row(retired.id, false)] },
      { userId: 'act-mm-1', score: 2, totalQuestions: 2, passed: true, createdAt: day(2), answersJson: [row(live.id, true), row(retired.id, true)] },
      { userId: 'act-mm-2', score: 1, totalQuestions: 2, passed: false, createdAt: day(1), answersJson: [row(live.id, false), row(retired.id, true)] },
      // The legacy quiz stored a map of answers: not an Academy attempt.
      { userId: 'act-mm-2', score: 0, totalQuestions: 1, passed: false, createdAt: day(3), answersJson: { [live.id]: 'x' } },
    ],
  })
  const mine = (await loadMostMissed(prisma, HR)).filter((r) => r.question.startsWith(PREFIX))
  const l = mine.find((r) => r.questionId === live.id)
  const r = mine.find((r) => r.questionId === retired.id)
  assert.ok(l && r)
  assert.deepEqual([l.attempts, l.wrong, l.firstAttempts, l.firstWrong, l.retired], [3, 2, 2, 2, false])
  assert.deepEqual([r.attempts, r.wrong, r.firstAttempts, r.firstWrong, r.retired], [3, 1, 2, 1, true])
  assert.equal(mine[0].questionId, live.id)
})

test('an employee gets 403', ACADEMY_DB_TEST, async () => {
  await assert.rejects(() => loadMostMissed(prisma, EMPLOYEE), hasStatus(403))
})
