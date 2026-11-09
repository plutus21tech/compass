import test from 'node:test'
import assert from 'node:assert/strict'
import type { QuizStatus } from '../lib/academy/quiz'
import { screenFor } from '../lib/academy/quiz-flow'
import type { HomeQuizView, QuizResultView, QuizView } from '../lib/academy/view'
import { allDoneTail, callTimeLabel, countdownLabel, passMarkLabel, quizCardCopy } from '../lib/academy/view-labels'

const QUIZ_HREF = '/onboarding/quiz'
const UNAVAILABLE = "The quiz isn't available right now. Please contact HR."
const RETAKE_AT = '2026-12-04T09:15:00.000Z'

function homeQuiz(status: QuizStatus, over: Partial<HomeQuizView> = {}): HomeQuizView {
  return { status, dueAt: null, retakeAt: null, failedCount: 0, overdue: false, ...over }
}

test('quizCardCopy: each status reads in the brief words', () => {
  assert.deepEqual(quizCardCopy(homeQuiz('LOCKED')), { label: 'Finish all 14 modules first', chip: null, href: null })
  assert.deepEqual(quizCardCopy(homeQuiz('READY')), { label: 'Start', chip: null, href: QUIZ_HREF })
  assert.deepEqual(quizCardCopy(homeQuiz('UNAVAILABLE')), { label: UNAVAILABLE, chip: null, href: null })
  assert.deepEqual(quizCardCopy(homeQuiz('PASSED_UNSIGNED')), { label: 'Sign your acknowledgement', chip: null, href: QUIZ_HREF })
})

test('quizCardCopy: a previous failed attempt turns Start into Retake', () => {
  assert.equal(quizCardCopy(homeQuiz('READY', { failedCount: 1 })).label, 'Retake')
  assert.equal(quizCardCopy(homeQuiz('READY', { failedCount: 1 })).href, QUIZ_HREF)
})

test('quizCardCopy: a cooldown names the time in the hire zone and still links, so results stay readable', () => {
  const quiz = homeQuiz('COOLDOWN', { retakeAt: RETAKE_AT, failedCount: 1 })
  assert.deepEqual(quizCardCopy(quiz, 'Asia/Karachi'), {
    label: `Retake after ${callTimeLabel(RETAKE_AT, 'Asia/Karachi')}`,
    chip: null,
    href: QUIZ_HREF,
  })
  assert.match(quizCardCopy(quiz).label, /UTC$/)
})

test('quizCardCopy: a cooldown with no time never prints a placeholder', () => {
  assert.equal(quizCardCopy(homeQuiz('COOLDOWN')).label, 'Retake')
})

test('quizCardCopy: DONE links to the quiz page, which finishes a hire who still has to sign again', () => {
  assert.deepEqual(quizCardCopy(homeQuiz('DONE')), { label: 'Completed', chip: null, href: QUIZ_HREF })
})

test('quizCardCopy: overdue adds the chip on every state but DONE', () => {
  const statuses: QuizStatus[] = ['LOCKED', 'READY', 'UNAVAILABLE', 'COOLDOWN', 'PASSED_UNSIGNED']
  for (const status of statuses) {
    assert.equal(quizCardCopy(homeQuiz(status, { overdue: true })).chip, 'Overdue', status)
    assert.equal(quizCardCopy(homeQuiz(status, { overdue: true, failedCount: 2 })).chip, 'Overdue', status)
  }
  assert.equal(quizCardCopy(homeQuiz('DONE', { overdue: true })).chip, null)
})

test('countdownLabel: minutes and seconds, with hours only when needed, and never below zero', () => {
  assert.equal(countdownLabel(14 * 60_000 + 32_000), '14:32')
  assert.equal(countdownLabel(5_000), '0:05')
  assert.equal(countdownLabel(500), '0:01')
  assert.equal(countdownLabel(0), '0:00')
  assert.equal(countdownLabel(-1_000), '0:00')
  assert.equal(countdownLabel(3_600_000 + 65_000), '1:01:05')
})

test('passMarkLabel: rounds up like the grader, so the mark shown is one that passes', () => {
  assert.equal(passMarkLabel({ total: 12, passPercent: 80 }), 'Pass mark: 10 out of 12 (80%)')
  assert.equal(passMarkLabel({ total: 10, passPercent: 80 }), 'Pass mark: 8 out of 10 (80%)')
  assert.equal(passMarkLabel({ total: 11, passPercent: 75 }), 'Pass mark: 9 out of 11 (75%)')
})

const failed: QuizResultView = { score: 6, total: 12, passed: false, passPercent: 80, review: [] }
const passed: QuizResultView = { ...failed, score: 11, passed: true }
const paper = { questions: [{ id: 'q1', text: 'One?', options: ['a', 'b'] }] }

// The server's clock reads one minute before the retake opens.
const SERVER_NOW = new Date(new Date(RETAKE_AT).getTime() - 60_000).toISOString()
const RECEIVED = Date.UTC(2030, 0, 1)

function view(status: QuizStatus, over: Partial<QuizView> = {}): QuizView {
  return { status, dueAt: null, paper: null, lastResult: null, retakeAt: null, failedCount: 0, serverNow: SERVER_NOW, ...over }
}

test('screenFor: a first attempt goes straight to the questions', () => {
  assert.deepEqual(screenFor(view('READY', { paper })), { kind: 'questions', paper })
})

test('screenFor: a cooldown keeps the results readable and counts down', () => {
  const quiz = view('COOLDOWN', { lastResult: failed, retakeAt: RETAKE_AT, failedCount: 1 })
  assert.deepEqual(screenFor(quiz, { receivedAtMs: RECEIVED }), {
    kind: 'results', result: failed, wait: { kind: 'until', at: RETAKE_AT, opensAtMs: RECEIVED + 60_000 },
  })
})

test('screenFor: the countdown runs on the server time, whatever the browser clock says', () => {
  const quiz = view('COOLDOWN', { lastResult: failed, retakeAt: RETAKE_AT, failedCount: 1 })
  // A browser clock years ahead of the server still waits the server's minute.
  const screen = screenFor(quiz, { receivedAtMs: RECEIVED })
  assert.ok(screen.kind === 'results' && screen.wait.kind === 'until')
  assert.equal(screen.wait.opensAtMs - RECEIVED, 60_000)
})

test('screenFor: once the wait is over the results stay, with the retake open', () => {
  const quiz = view('READY', { paper, lastResult: failed, failedCount: 1 })
  assert.deepEqual(screenFor(quiz), { kind: 'results', result: failed, wait: { kind: 'open' } })
})

test('screenFor: a fresh start skips the results', () => {
  const quiz = view('READY', { paper, lastResult: failed, failedCount: 1 })
  assert.deepEqual(screenFor(quiz, { fresh: true }), { kind: 'questions', paper })
})

test('screenFor: a retake pressed too early stays on the results, however it was asked', () => {
  const quiz = view('COOLDOWN', { lastResult: failed, retakeAt: RETAKE_AT })
  assert.equal(screenFor(quiz, { fresh: true }).kind, 'results')
})

test('screenFor: a passed hire returns to the acknowledgement, even on a repeat signature', () => {
  assert.deepEqual(screenFor(view('PASSED_UNSIGNED', { lastResult: passed })), { kind: 'acknowledgement' })
  assert.deepEqual(screenFor(view('DONE', { lastResult: passed })), { kind: 'acknowledgement' })
})

test('screenFor: an unavailable quiz, and states with nothing to show, fall back to the same panel', () => {
  assert.deepEqual(screenFor(view('UNAVAILABLE', { lastResult: failed })), { kind: 'unavailable' })
  assert.deepEqual(screenFor(view('READY')), { kind: 'unavailable' })
  assert.deepEqual(screenFor(view('COOLDOWN')), { kind: 'unavailable' })
})

test('screenFor: locked goes home', () => {
  assert.deepEqual(screenFor(view('LOCKED')), { kind: 'home' })
})

test('allDoneTail: DONE on Home means HR must step in', () => {
  assert.equal(allDoneTail('READY'), 'Your culture quiz is next.')
  assert.equal(allDoneTail('PASSED_UNSIGNED'), 'Sign your acknowledgement to finish.')
  assert.equal(allDoneTail('DONE'), 'Something still needs HR. Please get in touch.')
  assert.equal(allDoneTail('LOCKED'), null)
})
