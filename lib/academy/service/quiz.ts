import { z } from 'zod'
import type { OnboardingQuizQuestion, Prisma, PrismaClient, QuizAttempt } from '@prisma/client'
import { sendQuizFailAlert } from '@/lib/email'
import { AcademyError } from '../errors'
import {
  crossesFailThreshold,
  gradeAttempt,
  quizStatus,
  retakeAt,
  submissionSchema,
  toPaper,
  type QuizStatus,
  type StoredQuestion,
} from '../quiz'
import { timeZoneFor } from '../time'
import type { QuizResultView, QuizView } from '../view'
import { callTimeLabel } from '../view-labels'
import { buildAcademyContext, loadHireFacts } from './context'
import { getAcademyConfig } from './library'
import { COURSE_TX_OPTIONS, readCourseProgress } from './progress'

export type { QuizResultView, QuizView } from '../view'

type Db = PrismaClient | Prisma.TransactionClient
type Tx = Prisma.TransactionClient

const CONFIG_ID = 'singleton'
/** The schema default, for a database with no config row yet. */
const DEFAULT_PASS_PERCENT = 80

const notFound = () => new AcademyError('Not found', 404)

/**
 * Serializes everything that decides or changes one hire's quiz state. NO KEY UPDATE, so it doesn't
 * block the key-share lock that an insert referencing the user takes. Take it before reading status.
 */
export async function lockUserRow(tx: Tx, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR NO KEY UPDATE`
}

function toStoredQuestion(row: OnboardingQuizQuestion): StoredQuestion {
  const options = Array.isArray(row.optionsJson) ? row.optionsJson : []
  return {
    id: row.id,
    questionText: row.questionText,
    options: options.filter((option): option is string => typeof option === 'string'),
    correctAnswer: row.correctAnswer,
    explanation: row.explanation ?? '',
    valueKey: row.valueKey,
    videoChapterKey: row.videoChapterKey,
  }
}

/** Active, not retired, and with an explanation: the review owes every question one. */
async function usableQuestions(db: Db): Promise<StoredQuestion[]> {
  const rows = await db.onboardingQuizQuestion.findMany({
    where: { isActive: true, retiredAt: null },
    orderBy: { orderIndex: 'asc' },
  })
  return rows.filter((row) => row.explanation?.trim()).map(toStoredQuestion)
}

async function readPassPercent(db: Db): Promise<number> {
  const row = await db.onboardingConfig.findUnique({ where: { id: CONFIG_ID }, select: { quizPassPercent: true } })
  return row?.quizPassPercent ?? DEFAULT_PASS_PERCENT
}

const storedAnswers = z.array(
  z.object({ questionId: z.string(), chosen: z.string(), correct: z.boolean(), correctAnswer: z.string() }),
)
type StoredAnswer = z.infer<typeof storedAnswers>[number]

export type AcademyAttempt = Omit<QuizAttempt, 'answersJson'> & { answers: StoredAnswer[] }

/**
 * This user's attempts at the Academy quiz, newest first. The legacy quiz stored a map of answers in the
 * same table; those attempts are a different quiz, so nothing here or after it may count them.
 */
export async function readAcademyAttempts(db: Db, userId: string): Promise<AcademyAttempt[]> {
  const rows = await db.quizAttempt.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
  return rows.flatMap(({ answersJson, ...attempt }) => {
    const parsed = storedAnswers.safeParse(answersJson)
    return parsed.success ? [{ ...attempt, answers: parsed.data }] : []
  })
}

export interface QuizState {
  status: QuizStatus
  dueAt: string | null
  latest: AcademyAttempt | null
  /** Holds the answer key: for grading on the server, never for a view. */
  questions: StoredQuestion[]
  /** Only in COOLDOWN. */
  retakeAt: Date | null
  failedCount: number
}

/** Under lockUserRow this is the truth a submission is judged on; without it, it is what a page shows. */
export async function readQuizState(db: Db, userId: string, cooldownMinutes: number, now: Date): Promise<QuizState> {
  const { modulesDone, dueAt } = await readCourseProgress(db, userId)
  const attempts = await readAcademyAttempts(db, userId)
  const latest = attempts[0] ?? null
  const questions = await usableQuestions(db)
  const values = await db.onboardingAcknowledgement.findFirst({
    where: { userId, kind: 'VALUES_CODE_OF_CONDUCT' },
    select: { id: true },
  })
  const status = quizStatus({
    modulesDone, latest, valuesSigned: values !== null, cooldownMinutes, usableQuestions: questions.length, now,
  })
  return {
    status,
    dueAt,
    latest,
    questions,
    retakeAt: status === 'COOLDOWN' && latest ? retakeAt(latest.createdAt, cooldownMinutes) : null,
    failedCount: attempts.filter((attempt) => !attempt.passed).length,
  }
}

/** The correct answer comes from the attempt, so a later edit to the question can't contradict `correct`. */
function toReview(answers: readonly StoredAnswer[], questions: readonly StoredQuestion[]): QuizResultView['review'] {
  const byId = new Map(questions.map((q) => [q.id, q]))
  return answers.flatMap((answer) => {
    const question = byId.get(answer.questionId)
    if (!question) return []
    return [{
      question: question.questionText,
      chosen: answer.chosen,
      correctAnswer: answer.correctAnswer,
      correct: answer.correct,
      explanation: question.explanation,
      valueKey: question.valueKey,
    }]
  })
}

/** Resolved through the attempt's own question ids, so a retired question still shows. */
async function toLastResult(db: Db, attempt: AcademyAttempt): Promise<QuizResultView> {
  const { answers } = attempt
  const rows = await db.onboardingQuizQuestion.findMany({ where: { id: { in: answers.map((a) => a.questionId) } } })
  return {
    score: attempt.score,
    total: attempt.totalQuestions,
    passed: attempt.passed,
    passPercent: await readPassPercent(db),
    review: toReview(answers, rows.map(toStoredQuestion)),
  }
}

export async function loadQuiz(db: Db, userId: string): Promise<QuizView> {
  const context = await buildAcademyContext(db, userId)
  if (!context) throw notFound()
  const state = await readQuizState(db, userId, context.config.retakeCooldownMinutes, new Date())
  return {
    status: state.status,
    dueAt: state.dueAt,
    paper: state.status === 'READY' ? toPaper(state.questions) : null,
    lastResult: state.latest ? await toLastResult(db, state.latest) : null,
    retakeAt: state.retakeAt?.toISOString() ?? null,
    failedCount: state.failedCount,
  }
}

function assertCanSubmit(state: QuizState, timeZone: string | null): void {
  if (state.status === 'READY') return
  if (state.status === 'LOCKED') throw new AcademyError('Finish all 14 modules first.', 403)
  if (state.status === 'UNAVAILABLE') {
    console.error('[academy] quiz refused: too few usable questions', { count: state.questions.length })
    throw new AcademyError("The quiz isn't available right now. Please contact HR.", 409)
  }
  if (state.status === 'COOLDOWN') {
    const time = callTimeLabel(state.retakeAt?.toISOString() ?? null, timeZone)
    throw new AcademyError(`You can retake the quiz after ${time}.`, 409)
  }
  throw new AcademyError("You've already passed.", 409)
}

export interface SubmittedQuiz {
  result: QuizResultView
  failAlertDue: boolean
  /** For the alert, which goes out after the commit. Stays on the server. */
  failedCount: number
}

/** Everything is decided under the user lock, so a double submit grades once and a cooldown can't be raced. */
export async function submitQuiz(db: PrismaClient, userId: string, input: unknown): Promise<SubmittedQuiz> {
  const { answers } = submissionSchema.parse(input)
  return db.$transaction(async (tx) => {
    await lockUserRow(tx, userId)
    const facts = await loadHireFacts(tx, userId)
    if (!facts) throw notFound()
    const config = await getAcademyConfig(tx)
    const state = await readQuizState(tx, userId, config.retakeCooldownMinutes, new Date())
    assertCanSubmit(state, timeZoneFor(facts.attributes))

    const { questions } = state
    const passPercent = await readPassPercent(tx)
    const graded = gradeAttempt(questions, answers, passPercent)
    await tx.quizAttempt.create({
      data: {
        userId,
        score: graded.score,
        totalQuestions: graded.total,
        passed: graded.passed,
        answersJson: graded.answersJson,
      },
    })
    const failedCount = state.failedCount + (graded.passed ? 0 : 1)
    return {
      result: {
        score: graded.score,
        total: graded.total,
        passed: graded.passed,
        passPercent,
        review: toReview(graded.answersJson, questions),
      },
      failAlertDue: !graded.passed && crossesFailThreshold(failedCount, config.failAlertThreshold),
      failedCount,
    }
  }, COURSE_TX_OPTIONS)
}

/** HR's reset: lifts the cooldown and changes nothing else. The lock keeps it from racing a finishing hire. */
export async function clearQuizAttempts(db: PrismaClient, userId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await lockUserRow(tx, userId)
    const user = await tx.user.findUnique({ where: { id: userId }, select: { onboardingCompleted: true } })
    if (!user) throw new AcademyError('User not found', 404)
    if (user.onboardingCompleted) throw new AcademyError('This person has finished onboarding.', 409)
    await tx.quizAttempt.deleteMany({ where: { userId } })
  }, COURSE_TX_OPTIONS)
}

type SendAlert = (userId: string, failedCount: number) => Promise<{ success: boolean }>

/** A failed email never fails the attempt already saved, so it is logged, with the user id only. */
export async function notifyQuizFailAlert(userId: string, failedCount: number, send: SendAlert = sendQuizFailAlert): Promise<void> {
  try {
    const result = await send(userId, failedCount)
    if (!result.success) console.error('[academy] quiz fail alert not delivered', { userId })
  } catch {
    console.error('[academy] quiz fail alert failed', { userId })
  }
}
