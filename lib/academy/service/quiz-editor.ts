import type { OnboardingQuizQuestion, Prisma, PrismaClient } from '@prisma/client'
import { AcademyError } from '../errors'
import { MIN_QUIZ_QUESTIONS, QUIZ_MINIMUM_MESSAGE, questionInputSchema, type QuestionInput } from '../quiz'

type Db = PrismaClient | Prisma.TransactionClient

/** Orders at and above this are retired legacy rows (see prisma/seed-academy.ts). */
const RETIRED_RANGE_START = 1000

const isUsable = (row: Pick<OnboardingQuizQuestion, 'isActive' | 'retiredAt' | 'explanation'>) =>
  row.isActive && row.retiredAt === null && Boolean(row.explanation?.trim())

export interface QuestionListView {
  questions: OnboardingQuizQuestion[]
  usableCount: number
  minimum: number
}

export async function listQuestions(db: Db): Promise<QuestionListView> {
  const questions = await db.onboardingQuizQuestion.findMany({ orderBy: { orderIndex: 'asc' } })
  return { questions, usableCount: questions.filter(isUsable).length, minimum: MIN_QUIZ_QUESTIONS }
}

function toData(input: QuestionInput) {
  const { options, valueKey, videoChapterKey, ...rest } = input
  return { ...rest, optionsJson: options, valueKey: valueKey ?? null, videoChapterKey: videoChapterKey || null }
}

export async function createQuestion(db: PrismaClient, input: unknown): Promise<OnboardingQuizQuestion> {
  const data = toData(questionInputSchema.parse(input))
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const last = await db.onboardingQuizQuestion.aggregate({
      where: { orderIndex: { lt: RETIRED_RANGE_START } },
      _max: { orderIndex: true },
    })
    const orderIndex = (last._max.orderIndex ?? 0) + 1
    if (orderIndex >= RETIRED_RANGE_START) throw new AcademyError('The question bank is full.', 409)
    try {
      return await db.onboardingQuizQuestion.create({ data: { ...data, orderIndex, isActive: true } })
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error
    }
  }
  throw new AcademyError('Could not save that question. Try again.', 409)
}

/** Keeps the order and the active state. Old attempts hold their own answer key, so they stay true. */
export async function updateQuestion(db: PrismaClient, id: string, input: unknown): Promise<OnboardingQuizQuestion> {
  const data = toData(questionInputSchema.parse(input))
  const existing = await db.onboardingQuizQuestion.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw new AcademyError('Question not found', 404)
  return db.onboardingQuizQuestion.update({ where: { id }, data })
}

/** Soft delete: the row stays so old reviews still resolve. Refused if the quiz would drop below the minimum. */
export async function retireQuestion(db: PrismaClient, id: string): Promise<OnboardingQuizQuestion> {
  return db.$transaction(
    async (tx) => {
      const rows = await tx.onboardingQuizQuestion.findMany()
      const row = rows.find((r) => r.id === id)
      if (!row) throw new AcademyError('Question not found', 404)
      if (isUsable(row) && rows.filter(isUsable).length - 1 < MIN_QUIZ_QUESTIONS) throw new AcademyError(QUIZ_MINIMUM_MESSAGE, 409)
      return tx.onboardingQuizQuestion.update({ where: { id }, data: { isActive: false, retiredAt: row.retiredAt ?? new Date() } })
    },
    { isolationLevel: 'Serializable' },
  )
}

export async function reactivateQuestion(db: PrismaClient, id: string): Promise<OnboardingQuizQuestion> {
  const row = await db.onboardingQuizQuestion.findUnique({ where: { id } })
  if (!row) throw new AcademyError('Question not found', 404)
  if (!row.explanation?.trim()) throw new AcademyError('Add an explanation before bringing this question back.', 400)
  return db.onboardingQuizQuestion.update({ where: { id }, data: { isActive: true, retiredAt: null } })
}
