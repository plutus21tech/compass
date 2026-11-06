import type { Prisma, PrismaClient } from '@prisma/client'
import { sendOnboardingCompletedNotification } from '@/lib/email'
import { AcademyError } from '../errors'
import { VALUES_STATEMENT } from '../quiz'
import type { CompletionView } from '../view'
import { NAME_MESSAGE, isTypedNameValid } from './fields'
import { COURSE_TX_OPTIONS, readCourseProgress } from './progress'
import { lockUserRow, readAcademyAttempts } from './quiz'

export type { CompletionView } from '../view'

type Db = PrismaClient | Prisma.TransactionClient
type Tx = Prisma.TransactionClient

const VALUES_KIND = 'VALUES_CODE_OF_CONDUCT'
const REQUIRED_KINDS = ['SECURITY_SOPS', VALUES_KIND] as const

const hasPassed = async (db: Db, userId: string): Promise<boolean> =>
  (await readAcademyAttempts(db, userId)).some((attempt) => attempt.passed)

async function bothAcknowledged(tx: Tx, userId: string): Promise<boolean> {
  const signed = await tx.onboardingAcknowledgement.findMany({
    where: { userId, kind: { in: [...REQUIRED_KINDS] } },
    distinct: ['kind'],
    select: { kind: true },
  })
  return signed.length === REQUIRED_KINDS.length
}

/**
 * This lifts the lockout. Call it under lockUserRow, so the facts can't change between reading and
 * writing. The conditional write decides who finished: only the call that changed the user gets true.
 */
export async function finishCourseIfDone(tx: Tx, userId: string): Promise<boolean> {
  const { modulesDone } = await readCourseProgress(tx, userId)
  if (!modulesDone || !(await hasPassed(tx, userId)) || !(await bothAcknowledged(tx, userId))) return false
  const { count } = await tx.user.updateMany({
    where: { id: userId, onboardingCompleted: false, newHireRecord: { is: { academyReleasedAt: { not: null } } } },
    data: { onboardingCompleted: true },
  })
  if (count === 0) return false
  await tx.newHire.updateMany({ where: { userId }, data: { status: 'COMPLETED' } })
  return true
}

const firstValuesSignature = (db: Db, userId: string) =>
  db.onboardingAcknowledgement.findFirst({
    where: { userId, kind: VALUES_KIND },
    orderBy: { signedAt: 'asc' },
    select: { signedAt: true },
  })

/**
 * The first signature stands. Finishing runs on every call, so signing again retries a finish that
 * wasn't possible the first time; `completed` is true only on the call that lifted the lockout.
 */
export async function signValuesAcknowledgement(
  db: PrismaClient, userId: string, typedName: string,
): Promise<{ signedAt: Date; completed: boolean }> {
  return db.$transaction(async (tx) => {
    await lockUserRow(tx, userId)
    const user = await tx.user.findUnique({ where: { id: userId }, select: { name: true, onboardingCompleted: true } })
    if (!user) throw new AcademyError('User not found', 404)
    if (!(await hasPassed(tx, userId))) throw new AcademyError('Pass the culture quiz first.', 403)
    if (!isTypedNameValid(typedName, user.name)) throw new AcademyError(NAME_MESSAGE, 400)
    // Someone who finished has done this already: their re-read rows must not stop a repeat call returning.
    if (!user.onboardingCompleted && !(await readCourseProgress(tx, userId)).modulesDone) {
      throw new AcademyError('Finish the reopened module first.', 409)
    }

    const signed =
      (await firstValuesSignature(tx, userId)) ??
      (await tx.onboardingAcknowledgement.create({
        data: { userId, kind: VALUES_KIND, statementText: VALUES_STATEMENT, moduleVersionId: null, typedName: user.name },
        select: { signedAt: true },
      }))
    return { signedAt: signed.signedAt, completed: await finishCourseIfDone(tx, userId) }
  }, COURSE_TX_OPTIONS)
}

/** Null unless this person finished the Academy: an existing employee is completed but has no signature. */
export async function loadCompletion(db: Db, userId: string): Promise<CompletionView | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, onboardingCompleted: true, newHireRecord: { select: { preferredName: true } } },
  })
  if (!user?.onboardingCompleted) return null
  const signature = await firstValuesSignature(db, userId)
  if (!signature) return null
  return {
    name: user.name,
    preferredName: user.newHireRecord?.preferredName ?? user.name,
    completedAt: signature.signedAt.toISOString(),
  }
}

type SendCompleted = (userId: string) => Promise<{ success: boolean }>

/** The course is already finished: a failed email never fails that, so it is logged, with the user id only. */
export async function notifyCourseCompleted(
  userId: string,
  send: SendCompleted = sendOnboardingCompletedNotification,
): Promise<void> {
  try {
    const result = await send(userId)
    if (!result.success) console.error('[academy] completion notification not delivered', { userId })
  } catch {
    console.error('[academy] completion notification failed', { userId })
  }
}
