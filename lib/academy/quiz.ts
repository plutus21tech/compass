// Pure culture-quiz rules: paper building, grading, status. No server-only imports.
import { z } from 'zod'
import { AcademyError } from './errors'

export const VALUES_STATEMENT =
  'I have watched the culture video, passed the culture quiz, and I agree to follow the Plutus21 values and code of conduct.'

/** Below this many usable questions the quiz is closed: a pass on a tiny paper would mean nothing. */
export const MIN_QUIZ_QUESTIONS = 10

export type StoredQuestion = {
  id: string
  questionText: string
  options: string[]
  correctAnswer: string
  explanation: string
  valueKey: string | null
  videoChapterKey: string | null
}

export type QuizPaper = { questions: Array<{ id: string; text: string; options: string[] }> }

export type AttemptAnswer = { questionId: string; chosen: string; correct: boolean; correctAnswer: string; shownIndex: number }
export type GradedAttempt = { score: number; total: number; passed: boolean; answersJson: AttemptAnswer[] }

export const submissionSchema = z.object({
  answers: z.array(z.object({ questionId: z.string().min(1).max(100), chosen: z.string().max(500) })).min(1).max(50),
})
export type Submission = z.infer<typeof submissionSchema>

/** Fisher-Yates on a copy; the input is never changed. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** The client's copy: no answer key, explanation or value. */
export function toPaper(questions: StoredQuestion[], random: () => number = Math.random): QuizPaper {
  return {
    questions: shuffled(questions, random).map((q) => ({
      id: q.id,
      text: q.questionText,
      options: shuffled(q.options, random),
    })),
  }
}

function assertSameQuestions(questions: StoredQuestion[], answers: Submission['answers']): void {
  const submitted = answers.map((a) => a.questionId)
  const active = new Set(questions.map((q) => q.id))
  const exact = submitted.length === active.size && new Set(submitted).size === active.size && submitted.every((id) => active.has(id))
  if (!exact) throw new AcademyError('The quiz has been updated. Please start again.', 409)
}

// shownIndex is the client's question order (position in the submitted answers): HR analysis only, never grading.
function gradeOne(question: StoredQuestion, chosen: string, shownIndex: number): AttemptAnswer {
  if (!question.options.includes(chosen)) throw new AcademyError('That answer is not one of the options.', 400)
  const { correctAnswer } = question
  return { questionId: question.id, chosen, correct: chosen === correctAnswer, correctAnswer, shownIndex }
}

export function gradeAttempt(questions: StoredQuestion[], answers: Submission['answers'], passPercent: number): GradedAttempt {
  assertSameQuestions(questions, answers)
  const byId = new Map(questions.map((q) => [q.id, q]))
  const answersJson = answers.map((a, i) => gradeOne(byId.get(a.questionId) as StoredQuestion, a.chosen, i))
  const score = answersJson.filter((a) => a.correct).length
  const total = questions.length
  return { score, total, passed: score * 100 >= passPercent * total, answersJson }
}

export type QuizStatus = 'LOCKED' | 'READY' | 'UNAVAILABLE' | 'COOLDOWN' | 'PASSED_UNSIGNED' | 'DONE'
export type QuizStatusInput = {
  modulesDone: boolean
  latest: { passed: boolean; createdAt: Date } | null
  valuesSigned: boolean
  cooldownMinutes: number
  usableQuestions: number
  now: Date
}

export function retakeAt(createdAt: Date, cooldownMinutes: number): Date {
  return new Date(createdAt.getTime() + cooldownMinutes * 60_000)
}

export function quizStatus(input: QuizStatusInput): QuizStatus {
  const { modulesDone, latest, valuesSigned, cooldownMinutes, usableQuestions, now } = input
  if (!modulesDone) return 'LOCKED'
  if (latest?.passed) return valuesSigned ? 'DONE' : 'PASSED_UNSIGNED'
  if (latest && now.getTime() < retakeAt(latest.createdAt, cooldownMinutes).getTime()) return 'COOLDOWN'
  return usableQuestions >= MIN_QUIZ_QUESTIONS ? 'READY' : 'UNAVAILABLE'
}

/** True at every multiple of the threshold (3, 6, 9 failed attempts). */
export function crossesFailThreshold(failedCount: number, threshold: number): boolean {
  return threshold > 0 && failedCount > 0 && failedCount % threshold === 0
}
