// Pure culture-quiz rules: paper building, grading, status. No server-only imports.
import { z } from 'zod'
import { AcademyError } from './errors'

export const VALUES_STATEMENT =
  'I have watched the culture video, passed the culture quiz, and I agree to follow the Plutus21 values and code of conduct.'

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

export type AttemptAnswer = { questionId: string; chosen: string; correct: boolean; shownIndex: number }
export type GradedAttempt = { score: number; total: number; passed: boolean; answersJson: AttemptAnswer[] }

export const submissionSchema = z.object({
  answers: z.array(z.object({ questionId: z.string().min(1), chosen: z.string() })).min(1).max(50),
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
  if (!exact) throw new AcademyError('The quiz has changed. Please reload and try again.', 409)
}

function gradeOne(question: StoredQuestion, chosen: string): AttemptAnswer {
  const shownIndex = question.options.indexOf(chosen)
  if (shownIndex < 0) throw new AcademyError('That answer is not one of the options.', 400)
  return { questionId: question.id, chosen, correct: chosen === question.correctAnswer, shownIndex }
}

export function gradeAttempt(questions: StoredQuestion[], answers: Submission['answers'], passPercent: number): GradedAttempt {
  assertSameQuestions(questions, answers)
  const byId = new Map(questions.map((q) => [q.id, q]))
  const answersJson = answers.map((a) => gradeOne(byId.get(a.questionId) as StoredQuestion, a.chosen))
  const score = answersJson.filter((a) => a.correct).length
  const total = questions.length
  return { score, total, passed: score * 100 >= passPercent * total, answersJson }
}

export type QuizStatus = 'LOCKED' | 'READY' | 'COOLDOWN' | 'PASSED_UNSIGNED' | 'DONE'
export type QuizStatusInput = {
  modulesDone: boolean
  latest: { passed: boolean; createdAt: Date } | null
  valuesSigned: boolean
  cooldownMinutes: number
  now: Date
}

export function retakeAt(createdAt: Date, cooldownMinutes: number): Date {
  return new Date(createdAt.getTime() + cooldownMinutes * 60_000)
}

export function quizStatus(input: QuizStatusInput): QuizStatus {
  const { modulesDone, latest, valuesSigned, cooldownMinutes, now } = input
  if (!modulesDone) return 'LOCKED'
  if (!latest) return 'READY'
  if (latest.passed) return valuesSigned ? 'DONE' : 'PASSED_UNSIGNED'
  return now.getTime() < retakeAt(latest.createdAt, cooldownMinutes).getTime() ? 'COOLDOWN' : 'READY'
}

/** True at every multiple of the threshold (3, 6, 9 failed attempts). */
export function crossesFailThreshold(failedCount: number, threshold: number): boolean {
  return threshold > 0 && failedCount > 0 && failedCount % threshold === 0
}
