import type { Prisma, PrismaClient } from '@prisma/client'
import { canManageOnboarding } from '@/lib/permissions'
import { AcademyError } from '../errors'
import { mostMissed, type MostMissedRow } from '../most-missed'
import { storedAnswers } from './quiz'

type Db = PrismaClient | Prisma.TransactionClient

/** HR only. One attempts query and one questions query; retired questions are included. */
export async function loadMostMissed(db: Db, actor: { id: string; role: string }): Promise<MostMissedRow[]> {
  if (!canManageOnboarding(actor.role as Parameters<typeof canManageOnboarding>[0])) {
    throw new AcademyError('Forbidden', 403)
  }
  // Unbounded on purpose: every attempt counts toward the rates, and the table stays small (a few per hire).
  const rows = await db.quizAttempt.findMany({ select: { userId: true, createdAt: true, answersJson: true } })
  // The legacy quiz stored a map of answers in this table; only array-shaped rows are Academy attempts.
  const attempts = rows.flatMap(({ userId, createdAt, answersJson }) => {
    const parsed = storedAnswers.safeParse(answersJson)
    return parsed.success ? [{ userId, createdAt, answers: parsed.data }] : []
  })
  const ids = [...new Set(attempts.flatMap((a) => a.answers.map((x) => x.questionId)))]
  const questions = await db.onboardingQuizQuestion.findMany({
    where: { id: { in: ids } },
    select: { id: true, questionText: true, retiredAt: true },
  })
  return mostMissed(attempts, questions)
}
