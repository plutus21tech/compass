import test from 'node:test'
import assert from 'node:assert/strict'
import { MIN_ANSWERS, answerNote, mostMissed, type MissedAttempt, type MissedQuestion } from '../lib/academy/most-missed'

const at = (day: number) => new Date(Date.UTC(2026, 10, day))
const answer = (questionId: string, correct: boolean) => ({ questionId, correct })
const attempt = (userId: string, day: number, answers: ReturnType<typeof answer>[]): MissedAttempt => ({
  userId, createdAt: at(day), answers,
})
const question = (id: string, retiredAt: Date | null = null): MissedQuestion => ({ id, questionText: `Question ${id}`, retiredAt })

test('rates are wrong over attempts; rows short of MIN_ANSWERS sort by attempts', () => {
  const rows = mostMissed(
    [
      attempt('u1', 1, [answer('a', false), answer('b', true), answer('c', false)]),
      attempt('u2', 1, [answer('a', true), answer('b', true), answer('c', false)]),
      attempt('u3', 1, [answer('a', false), answer('b', false)]),
      attempt('u4', 1, [answer('a', true)]),
    ],
    [question('a'), question('b'), question('c')],
  )
  assert.deepEqual(rows.map((r) => [r.questionId, r.attempts, r.wrong, r.wrongRate]), [
    ['a', 4, 2, 0.5],
    ['b', 3, 1, 1 / 3],
    ['c', 2, 2, 1],
  ])
  assert.equal(rows[2].question, 'Question c')
})

test('equal rates put the question with more attempts first', () => {
  const rows = mostMissed(
    [attempt('u1', 1, [answer('a', false), answer('b', false)]), attempt('u2', 1, [answer('b', false)])],
    [question('a'), question('b')],
  )
  assert.deepEqual(rows.map((r) => r.questionId), ['b', 'a'])
})

test('first attempts are each persons earliest attempt containing the question', () => {
  const rows = mostMissed(
    [
      // Given newest first, as the reader returns them.
      attempt('u1', 5, [answer('a', true)]),
      attempt('u1', 3, [answer('a', false)]),
      attempt('u1', 1, [answer('b', false)]),
      attempt('u2', 2, [answer('a', true)]),
    ],
    [question('a'), question('b')],
  )
  const a = rows.find((r) => r.questionId === 'a')
  assert.ok(a)
  assert.equal(a.attempts, 3)
  assert.equal(a.wrong, 1)
  // u1 earliest with "a" is day 3 (wrong); u2 earliest is day 2 (right).
  assert.equal(a.firstAttempts, 2)
  assert.equal(a.firstWrong, 1)
})

test('retired questions are kept and labelled', () => {
  const rows = mostMissed([attempt('u1', 1, [answer('a', false), answer('b', true)])], [question('a', at(9)), question('b')])
  assert.equal(rows.find((r) => r.questionId === 'a')?.retired, true)
  assert.equal(rows.find((r) => r.questionId === 'b')?.retired, false)
})

test('questions with no attempts, and answers to unknown questions, are left out', () => {
  const rows = mostMissed([attempt('u1', 1, [answer('a', true), answer('gone', false)])], [question('a'), question('unused')])
  assert.deepEqual(rows.map((r) => r.questionId), ['a'])
})

test('no attempts gives no rows', () => {
  assert.deepEqual(mostMissed([], [question('a')]), [])
})

test('the note shows under 5 answers and not from 5', () => {
  assert.equal(MIN_ANSWERS, 5)
  assert.equal(answerNote(4), 'Not enough answers yet')
  assert.equal(answerNote(5), null)
})

test('rows with enough answers rank first by rate; the rest follow by attempts', () => {
  const many = (prefix: string, count: number, questionId: string, wrongCount: number) =>
    Array.from({ length: count }, (_, i) => attempt(`${prefix}${i}`, 1, [answer(questionId, i >= wrongCount)]))
  const rows = mostMissed(
    [
      ...many('few', 1, 'one-of-one', 1), // 1 of 1 wrong: 100%, too few answers
      ...many('some', 3, 'three', 1), // 1 of 3 wrong, too few answers
      ...many('real', MIN_ANSWERS, 'real-high', 3), // 3 of 5 wrong
      ...many('low', MIN_ANSWERS + 1, 'real-low', 1), // 1 of 6 wrong
    ],
    [question('one-of-one'), question('three'), question('real-high'), question('real-low')],
  )
  assert.deepEqual(rows.map((r) => r.questionId), ['real-high', 'real-low', 'three', 'one-of-one'])
})
