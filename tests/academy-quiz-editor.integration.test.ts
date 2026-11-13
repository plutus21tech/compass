import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { AcademyError } from '../lib/academy/errors'
import { MIN_QUIZ_QUESTIONS } from '../lib/academy/quiz'
import { createQuestion, listQuestions, reactivateQuestion, retireQuestion, updateQuestion } from '../lib/academy/service/quiz-editor'
import { createTemplateItem, updateTemplateItem } from '../lib/academy/service/checklist-template'
import { createChecklist, listChecklist } from '../lib/academy/service/checklist'
import { tickChecklistItem } from '../lib/academy/service/tracker-actions'
import { readAcademyAttempts } from '../lib/academy/service/quiz'
import { ACADEMY_DB_TEST, P } from './helpers/academy-test-db'
import { NEW_HIRE_ID, cleanCourse, createReadyHire } from './helpers/academy-course-fixtures'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'

const PREFIX = 'act-ed-'
const refuses = (status: number, message?: RegExp) => (e: unknown) => {
  assert.ok(e instanceof AcademyError, String(e))
  assert.equal(e.status, status)
  if (message) assert.match(e.message, message)
  return true
}
const input = (n: number) => ({
  questionText: `${PREFIX}question ${n}`, options: ['Yes', 'No'], correctAnswer: 'Yes', explanation: `Because ${n}.`,
})

/** Questions that were active before the first park, so `after` can switch them back on. */
let parkedIds: string[] | null = null

/** Exactly `count` usable questions, all ours; any seeded bank questions are parked inactive. */
async function bankOf(count: number): Promise<string[]> {
  await prisma.onboardingQuizQuestion.deleteMany({ where: { questionText: { startsWith: PREFIX } } })
  if (parkedIds === null) {
    parkedIds = (await prisma.onboardingQuizQuestion.findMany({ where: { isActive: true }, select: { id: true } })).map((q) => q.id)
  }
  await prisma.onboardingQuizQuestion.updateMany({ data: { isActive: false } })
  const ids: string[] = []
  for (let i = 0; i < count; i += 1) ids.push((await createQuestion(prisma, input(i))).id)
  return ids
}

/** Our template items, and the rows that point at them, must go together. */
async function dropOurTemplateItems(): Promise<void> {
  await prisma.onboardingChecklistItem.deleteMany({ where: { templateItem: { key: { startsWith: 'act-ed' } } } })
  await prisma.onboardingChecklistTemplateItem.deleteMany({ where: { key: { startsWith: 'act-ed' } } })
}

beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await dropOurTemplateItems()
  await createReadyHire()
})
after(async () => {
  if (WEEKLY_DB_READY) {
    await prisma.onboardingQuizQuestion.deleteMany({ where: { questionText: { startsWith: PREFIX } } })
    await dropOurTemplateItems()
    if (parkedIds) await prisma.onboardingQuizQuestion.updateMany({ where: { id: { in: parkedIds } }, data: { isActive: true } })
    await cleanCourse()
  }
  await prisma.$disconnect()
})

test('a new question takes the next free index below the retired range', ACADEMY_DB_TEST, async () => {
  const [first] = await bankOf(1)
  const a = await prisma.onboardingQuizQuestion.findUniqueOrThrow({ where: { id: first } })
  const b = await createQuestion(prisma, input(50))
  assert.ok(b.orderIndex > a.orderIndex)
  assert.ok(b.orderIndex < 1000)
  assert.equal(b.isActive, true)
})

test('retiring keeps the row and sets isActive false and retiredAt', ACADEMY_DB_TEST, async () => {
  const ids = await bankOf(MIN_QUIZ_QUESTIONS + 1)
  await retireQuestion(prisma, ids[0])
  const row = await prisma.onboardingQuizQuestion.findUniqueOrThrow({ where: { id: ids[0] } })
  assert.equal(row.isActive, false)
  assert.ok(row.retiredAt)
})

test('retiring below the minimum is refused with the plain message', ACADEMY_DB_TEST, async () => {
  const ids = await bankOf(MIN_QUIZ_QUESTIONS)
  await assert.rejects(retireQuestion(prisma, ids[0]), refuses(409, /^The quiz needs at least 10 questions\.$/))
  assert.equal((await prisma.onboardingQuizQuestion.findUniqueOrThrow({ where: { id: ids[0] } })).isActive, true)
})

test('reactivating needs an explanation, and a retired question comes back', ACADEMY_DB_TEST, async () => {
  const ids = await bankOf(MIN_QUIZ_QUESTIONS + 1)
  await retireQuestion(prisma, ids[0])
  await reactivateQuestion(prisma, ids[0])
  const back = await prisma.onboardingQuizQuestion.findUniqueOrThrow({ where: { id: ids[0] } })
  assert.equal(back.isActive, true)
  assert.equal(back.retiredAt, null)
  await retireQuestion(prisma, ids[0])
  await prisma.onboardingQuizQuestion.update({ where: { id: ids[0] }, data: { explanation: null } })
  await assert.rejects(reactivateQuestion(prisma, ids[0]), refuses(400))
})

test('an old attempt still resolves after its question is edited and retired', ACADEMY_DB_TEST, async () => {
  const ids = await bankOf(MIN_QUIZ_QUESTIONS + 1)
  await prisma.quizAttempt.create({
    data: {
      userId: P.hire.id, score: 1, totalQuestions: 1, passed: false,
      answersJson: [{ questionId: ids[0], chosen: 'No', correct: false, correctAnswer: 'Yes', shownIndex: 0 }],
    },
  })
  await updateQuestion(prisma, ids[0], { ...input(0), options: ['Maybe', 'Sure'], correctAnswer: 'Sure' })
  await retireQuestion(prisma, ids[0])
  const [attempt] = await readAcademyAttempts(prisma, P.hire.id)
  assert.equal(attempt.answers[0].correctAnswer, 'Yes')
  assert.equal((await prisma.onboardingQuizQuestion.findUnique({ where: { id: ids[0] } }))?.id, ids[0])
  await prisma.quizAttempt.deleteMany({ where: { userId: P.hire.id } })
})

test('editing keeps the order index; the list counts usable questions', ACADEMY_DB_TEST, async () => {
  const ids = await bankOf(3)
  const before = await prisma.onboardingQuizQuestion.findUniqueOrThrow({ where: { id: ids[1] } })
  const saved = await updateQuestion(prisma, ids[1], { ...input(1), questionText: `${PREFIX}renamed` })
  assert.equal(saved.orderIndex, before.orderIndex)
  const view = await listQuestions(prisma)
  assert.equal(view.usableCount, 3)
  assert.equal(view.minimum, MIN_QUIZ_QUESTIONS)
  await assert.rejects(updateQuestion(prisma, 'nope', input(1)), refuses(404))
})

test('a template edit of title, owner and order leaves an existing row alone, and the next hire gets the new values', ACADEMY_DB_TEST, async () => {
  const row = await prisma.onboardingChecklistItem.findFirstOrThrow({
    where: { newHireId: NEW_HIRE_ID, templateItem: { key: 'hr-call' } },
    include: { templateItem: true },
  })
  const t = row.templateItem
  const oa = { id: P.oa.id, role: P.oa.role }
  try {
    await updateTemplateItem(prisma, t.id, { title: 'act-ed Renamed call', ownerRole: 'OA', dueOffsetDays: t.dueOffsetDays, isActive: true, orderIndex: 900 })
    const items = await listChecklist(prisma, NEW_HIRE_ID)
    const after = items.find((i) => i.key === 'hr-call')
    assert.equal(after?.title, t.title)
    assert.equal(after?.ownerRole, 'HR')
    assert.notEqual(items.at(-1)?.key, 'hr-call')
    const stored = await prisma.onboardingChecklistItem.findUniqueOrThrow({ where: { id: row.id } })
    assert.equal(stored.ownerRole, 'HR')
    assert.equal(stored.orderIndex, t.orderIndex)
    // OA is not the owner of the existing row, so OA cannot tick it.
    await assert.rejects(tickChecklistItem(prisma, oa, row.id, { done: true }), refuses(403))
    // A hire who has no checklist yet gets the new values.
    await prisma.onboardingChecklistItem.deleteMany({ where: { newHireId: NEW_HIRE_ID } })
    await createChecklist(prisma, NEW_HIRE_ID)
    const fresh = await prisma.onboardingChecklistItem.findFirstOrThrow({ where: { newHireId: NEW_HIRE_ID, templateItem: { key: 'hr-call' } } })
    assert.equal(fresh.title, 'act-ed Renamed call')
    assert.equal(fresh.ownerRole, 'OA')
    assert.equal(fresh.orderIndex, 900)
  } finally {
    await prisma.onboardingChecklistTemplateItem.update({ where: { id: t.id }, data: { title: t.title, ownerRole: t.ownerRole, orderIndex: t.orderIndex } })
  }
})

test('retire turns a serialization failure into a plain 409', ACADEMY_DB_TEST, async () => {
  const lost = Object.assign(new Error('write conflict'), { code: 'P2034' })
  const fake = { $transaction: async () => { throw lost } } as unknown as typeof prisma
  await assert.rejects(retireQuestion(fake, 'x'), refuses(409, /^Someone else just changed the quiz\. Reload and try again\.$/))
})

test('a question with stale legacy content cannot be brought back', ACADEMY_DB_TEST, async () => {
  const ids = await bankOf(MIN_QUIZ_QUESTIONS + 1)
  await retireQuestion(prisma, ids[0])
  await prisma.onboardingQuizQuestion.update({ where: { id: ids[0] }, data: { optionsJson: ['Only one'], correctAnswer: 'Gone' } })
  await assert.rejects(reactivateQuestion(prisma, ids[0]), refuses(400, /needs fixing/))
})

test('a new template item reaches the next hire only, with a unique key from the title', ACADEMY_DB_TEST, async () => {
  const rowsBefore = await prisma.onboardingChecklistItem.count({ where: { newHireId: NEW_HIRE_ID } })
  const one = await createTemplateItem(prisma, { title: 'act-ed Welcome lunch', ownerRole: 'HR', dueOffsetDays: -2, isActive: true })
  const two = await createTemplateItem(prisma, { title: 'act-ed Welcome lunch', ownerRole: 'OA', dueOffsetDays: 3, isActive: true })
  assert.equal(one.key, 'act-ed-welcome-lunch')
  assert.equal(two.key, 'act-ed-welcome-lunch-2')
  assert.equal(one.autoTickEvent, null)
  assert.equal(await createChecklist(prisma, NEW_HIRE_ID), 0)
  assert.equal(await prisma.onboardingChecklistItem.count({ where: { newHireId: NEW_HIRE_ID } }), rowsBefore)
  await prisma.onboardingChecklistItem.deleteMany({ where: { newHireId: NEW_HIRE_ID } })
  await createChecklist(prisma, NEW_HIRE_ID)
  const keys = (await prisma.onboardingChecklistItem.findMany({ where: { newHireId: NEW_HIRE_ID }, include: { templateItem: true } })).map((r) => r.templateItem.key)
  assert.ok(keys.includes(one.key))
})

test('updateTemplateItem cannot change the key', ACADEMY_DB_TEST, async () => {
  const item = await createTemplateItem(prisma, { title: 'act-ed Keep my key', ownerRole: 'HR', dueOffsetDays: 0, isActive: true })
  const saved = await updateTemplateItem(prisma, item.id, { title: 'act-ed Different title', ownerRole: 'OA', dueOffsetDays: 4, isActive: false, orderIndex: 99 })
  assert.equal(saved.key, item.key)
  assert.equal(saved.isActive, false)
  await assert.rejects(updateTemplateItem(prisma, 'nope', { title: 'x', ownerRole: 'HR', dueOffsetDays: 0, isActive: true, orderIndex: 1 }), refuses(404))
})
