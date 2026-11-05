import test from 'node:test'
import assert from 'node:assert/strict'
import { VALUE_COLOURS } from '../components/academy/brand'
import { AcademyError } from '../lib/academy/errors'
import { ACADEMY_QUIZ_QUESTIONS } from '../prisma/seed-academy-quiz'
import {
  MIN_QUIZ_QUESTIONS, VALUES_STATEMENT, crossesFailThreshold, gradeAttempt, quizStatus, retakeAt, shuffled, submissionSchema, toPaper,
  type StoredQuestion,
} from '../lib/academy/quiz'

const stored: StoredQuestion[] = ACADEMY_QUIZ_QUESTIONS.map((q, i) => ({ ...q, id: `q${i + 1}` }))
const correctAll = stored.map((q) => ({ questionId: q.id, chosen: q.correctAnswer }))
const wrongOption = (q: StoredQuestion) => q.options.find((o) => o !== q.correctAnswer) as string
const withWrong = (n: number) =>
  stored.map((q, i) => ({ questionId: q.id, chosen: i < n ? wrongOption(q) : q.correctAnswer }))

/** A deterministic generator (mulberry32). */
function seeded(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

test('the bank has 12 well-formed questions', () => {
  assert.equal(ACADEMY_QUIZ_QUESTIONS.length, 12)
  for (const q of ACADEMY_QUIZ_QUESTIONS) {
    assert.equal(q.options.length, 4)
    assert.equal(new Set(q.options).size, 4)
    assert.ok(q.options.includes(q.correctAnswer))
    assert.ok(q.explanation.length > 0)
    assert.ok(!q.explanation.includes('Why:'))
    assert.ok(q.valueKey && q.valueKey in VALUE_COLOURS, q.questionText)
  }
})

test('the values statement is exact', () => {
  assert.equal(
    VALUES_STATEMENT,
    'I have watched the culture video, passed the culture quiz, and I agree to follow the Plutus21 values and code of conduct.',
  )
})

test('shuffled keeps every item and does not mutate the input', () => {
  const input = [1, 2, 3, 4, 5, 6]
  const out = shuffled(input, seeded(7))
  assert.deepEqual([...out].sort(), input)
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6])
})

test('toPaper hides the answer key and reorders questions and options', () => {
  const paper = toPaper(stored, seeded(42))
  const text = JSON.stringify(paper)
  for (const key of ['correctAnswer', 'explanation', 'valueKey']) assert.ok(!text.includes(`"${key}"`), key)
  assert.equal(paper.questions.length, 12)
  assert.notDeepEqual(paper.questions.map((q) => q.id), stored.map((q) => q.id))
  const original = stored.find((s) => s.id === paper.questions[0].id) as StoredQuestion
  assert.deepEqual([...paper.questions[0].options].sort(), [...original.options].sort())
  assert.ok(paper.questions.some((q) => {
    const o = stored.find((s) => s.id === q.id) as StoredQuestion
    return q.options.join('|') !== o.options.join('|')
  }))
  assert.deepEqual(paper.questions.map((q) => q.id).sort(), stored.map((q) => q.id).sort())
})

test('submissionSchema accepts 1 to 50 answers', () => {
  assert.equal(submissionSchema.safeParse({ answers: [] }).success, false)
  assert.equal(submissionSchema.safeParse({ answers: [{ questionId: 'a', chosen: 'b' }] }).success, true)
  const fifty = Array.from({ length: 50 }, (_, i) => ({ questionId: `q${i}`, chosen: 'x' }))
  assert.equal(submissionSchema.safeParse({ answers: fifty }).success, true)
  assert.equal(submissionSchema.safeParse({ answers: [...fifty, { questionId: 'z', chosen: 'x' }] }).success, false)
})

test('gradeAttempt passes 10 of 12 at 80 and fails 9 of 12', () => {
  const pass = gradeAttempt(stored, withWrong(2), 80)
  assert.deepEqual([pass.score, pass.total, pass.passed], [10, 12, true])
  const fail = gradeAttempt(stored, withWrong(3), 80)
  assert.deepEqual([fail.score, fail.total, fail.passed], [9, 12, false])
  assert.equal(gradeAttempt(stored, correctAll, 80).score, 12)
})

test('gradeAttempt scores all wrong as 0 and records each answer', () => {
  const result = gradeAttempt(stored, withWrong(12), 80)
  assert.equal(result.score, 0)
  assert.equal(result.passed, false)
  assert.equal(result.answersJson.length, 12)
  assert.equal(result.answersJson[0].correct, false)
  const q1 = stored[0]
  assert.equal(result.answersJson[0].questionId, q1.id)
  assert.equal(result.answersJson[0].shownIndex, 0)
})

test('shownIndex is the position in the submitted answers', () => {
  const order = shuffled(correctAll, seeded(5))
  const result = gradeAttempt(stored, order, 80)
  result.answersJson.forEach((a, i) => {
    assert.equal(a.shownIndex, i)
    assert.equal(a.questionId, order[i].questionId)
  })
})

test('submissionSchema caps questionId at 100 and chosen at 500 characters', () => {
  const ok = { answers: [{ questionId: 'q'.repeat(100), chosen: 'c'.repeat(500) }] }
  assert.equal(submissionSchema.safeParse(ok).success, true)
  assert.equal(submissionSchema.safeParse({ answers: [{ questionId: 'q'.repeat(101), chosen: 'c' }] }).success, false)
  assert.equal(submissionSchema.safeParse({ answers: [{ questionId: 'q', chosen: 'c'.repeat(501) }] }).success, false)
})

function statusOf(fn: () => unknown): number | undefined {
  try {
    fn()
  } catch (e) {
    return e instanceof AcademyError ? e.status : -1
  }
  return undefined
}

test('gradeAttempt rejects a missing, extra or repeated question with 409', () => {
  assert.equal(statusOf(() => gradeAttempt(stored, correctAll.slice(1), 80)), 409)
  assert.equal(statusOf(() => gradeAttempt(stored, [...correctAll, { questionId: 'nope', chosen: 'x' }], 80)), 409)
  assert.equal(statusOf(() => gradeAttempt(stored, [...correctAll.slice(1), correctAll[1]], 80)), 409)
})

test('gradeAttempt rejects an unknown option with 400', () => {
  const answers = correctAll.map((a, i) => (i === 0 ? { ...a, chosen: 'not an option' } : a))
  assert.equal(statusOf(() => gradeAttempt(stored, answers, 80)), 400)
})

test('quizStatus covers each state', () => {
  const now = new Date('2026-11-05T12:00:00Z')
  const ago = (min: number) => new Date(now.getTime() - min * 60_000)
  const base = { modulesDone: true, latest: null, valuesSigned: false, cooldownMinutes: 15, usableQuestions: 12, now }
  assert.equal(quizStatus({ ...base, modulesDone: false }), 'LOCKED')
  assert.equal(quizStatus(base), 'READY')
  assert.equal(quizStatus({ ...base, latest: { passed: false, createdAt: ago(14) } }), 'COOLDOWN')
  assert.equal(quizStatus({ ...base, latest: { passed: false, createdAt: ago(15) } }), 'READY')
  assert.equal(quizStatus({ ...base, latest: { passed: true, createdAt: ago(1) } }), 'PASSED_UNSIGNED')
  assert.equal(quizStatus({ ...base, latest: { passed: true, createdAt: ago(1) }, valuesSigned: true }), 'DONE')
})

test('quizStatus: too few usable questions is UNAVAILABLE, and only where READY would apply', () => {
  const now = new Date('2026-11-05T12:00:00Z')
  const ago = (min: number) => new Date(now.getTime() - min * 60_000)
  const base = { modulesDone: true, latest: null, valuesSigned: false, cooldownMinutes: 15, usableQuestions: MIN_QUIZ_QUESTIONS - 1, now }
  assert.equal(MIN_QUIZ_QUESTIONS, 10)
  assert.equal(quizStatus(base), 'UNAVAILABLE')
  assert.equal(quizStatus({ ...base, usableQuestions: 0 }), 'UNAVAILABLE')
  assert.equal(quizStatus({ ...base, usableQuestions: MIN_QUIZ_QUESTIONS }), 'READY')
  assert.equal(quizStatus({ ...base, latest: { passed: false, createdAt: ago(15) } }), 'UNAVAILABLE')
  assert.equal(quizStatus({ ...base, modulesDone: false }), 'LOCKED')
  assert.equal(quizStatus({ ...base, latest: { passed: false, createdAt: ago(14) } }), 'COOLDOWN')
  assert.equal(quizStatus({ ...base, latest: { passed: true, createdAt: ago(1) } }), 'PASSED_UNSIGNED')
  assert.equal(quizStatus({ ...base, latest: { passed: true, createdAt: ago(1) }, valuesSigned: true }), 'DONE')
})

test('gradeAttempt records the correct answer in each row', () => {
  const result = gradeAttempt(stored, withWrong(1), 80)
  result.answersJson.forEach((row) => {
    assert.equal(row.correctAnswer, stored.find((q) => q.id === row.questionId)?.correctAnswer)
  })
})

test('retakeAt is the cooldown after the attempt', () => {
  const at = new Date('2026-11-05T12:00:00Z')
  assert.equal(retakeAt(at, 15).toISOString(), '2026-11-05T12:15:00.000Z')
})

test('crossesFailThreshold fires at every multiple of the threshold', () => {
  const got = [2, 3, 4, 6, 0].map((n) => crossesFailThreshold(n, 3))
  assert.deepEqual(got, [false, true, false, true, false])
})
