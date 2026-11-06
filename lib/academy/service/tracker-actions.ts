import type { OnboardingProgress, Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { linkedinUrlSchema } from '../bank'
import { canTickItem, type ChecklistItemView, type ChecklistOwnerRole } from '../checklist'
import { AcademyError } from '../errors'
import { parseProgressState } from '../progress'
import { listChecklist, tickItem, type TickInput } from './checklist'
import { LINKEDIN_MODULE_SLUG } from './fields'
import { COURSE_TX_OPTIONS, findCourseModule, listCourseModules, lockProgressRow } from './progress'
import { clearQuizAttempts } from './quiz'
import type { TrackerViewer } from './tracker'

const NO_LINK_MESSAGE = "There's no LinkedIn link to verify yet."
const REASON_MAX = 500

const NOT_RELEASED_MESSAGE = "This hire's course hasn't been released yet."

const hireNotFound = () => new AcademyError('New hire not found', 404)
const moduleNotFound = () => new AcademyError('Module not found', 404)

export const unlockBodySchema = z.object({ moduleId: z.string().min(1).max(100) }).strict()

export const tickBodySchema = z
  .object({ done: z.boolean(), missReason: z.string().trim().max(REASON_MAX).optional() })
  .strict()

/** HR opens a course module early. A row that is already open or finished is left as it is. Routes are HR only. */
export async function unlockModule(db: PrismaClient, newHireId: string, moduleId: string, actorId: string): Promise<void> {
  const hire = await db.newHire.findUnique({ where: { id: newHireId }, select: { userId: true, academyReleasedAt: true } })
  if (!hire) throw hireNotFound()
  if (!hire.academyReleasedAt) throw new AcademyError(NOT_RELEASED_MESSAGE, 409)
  const { userId } = hire
  if (!userId) throw moduleNotFound()
  await db.$transaction(async (tx) => {
    const modules = await listCourseModules(tx)
    if (!modules.some((module) => module.id === moduleId)) throw moduleNotFound()
    const row = await lockProgressRow(tx, userId, moduleId)
    if (row.source !== 'COURSE') throw moduleNotFound()
    if (row.status !== 'LOCKED') return
    await tx.onboardingProgress.update({ where: { id: row.id }, data: { status: 'IN_PROGRESS', unlockedEarlyById: actorId } })
  }, COURSE_TX_OPTIONS)
}

/** The hire's Module 8 row under its lock, or null when the course isn't there to have one. */
async function lockLinkedinRow(tx: Prisma.TransactionClient, userId: string): Promise<OnboardingProgress | null> {
  try {
    const { module } = findCourseModule(await listCourseModules(tx), LINKEDIN_MODULE_SLUG)
    return await lockProgressRow(tx, userId, module.id)
  } catch (error) {
    if (error instanceof AcademyError && error.status === 404) return null
    throw error
  }
}

/**
 * HR confirms the link the hire saved: it goes to the profile and the checklist can tick. Read under
 * the row lock saveLinkedinUrl writes under. A link already verified is left alone; a changed one
 * can be verified again.
 */
export async function verifyLinkedin(db: PrismaClient, newHireId: string, actorId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const hire = await tx.newHire.findUnique({
      where: { id: newHireId },
      select: { userId: true, linkedinVerifiedAt: true, user: { select: { linkedinUrl: true } } },
    })
    if (!hire) throw hireNotFound()
    const row = hire.userId ? await lockLinkedinRow(tx, hire.userId) : null
    if (!hire.userId || !row) throw new AcademyError(NO_LINK_MESSAGE, 400)
    const saved = parseProgressState(row.state).linkedinUrl
    if (saved === undefined) throw new AcademyError(NO_LINK_MESSAGE, 400)
    const parsed = linkedinUrlSchema.safeParse(saved)
    if (!parsed.success) throw new AcademyError(parsed.error.issues[0]?.message ?? NO_LINK_MESSAGE, 400)
    if (hire.linkedinVerifiedAt && hire.user?.linkedinUrl === parsed.data) return

    await tx.user.update({ where: { id: hire.userId }, data: { linkedinUrl: parsed.data } })
    await tx.newHire.update({ where: { id: newHireId }, data: { linkedinVerifiedAt: new Date() } })
    console.info('[academy] LinkedIn verified', { newHireId, actorId })
  }, COURSE_TX_OPTIONS)
}

/** HR, Security, OA or the assigned lead, each for their own items. */
export async function tickChecklistItem(
  db: PrismaClient, viewer: TrackerViewer, itemId: string, input: TickInput, now: Date = new Date(),
): Promise<ChecklistItemView> {
  const item = await db.onboardingChecklistItem.findUnique({
    where: { id: itemId },
    select: { templateItem: { select: { ownerRole: true } }, newHire: { select: { teamLeadId: true } } },
  })
  if (!item) throw new AcademyError('Checklist item not found', 404)
  const ownerRole = item.templateItem.ownerRole as ChecklistOwnerRole
  if (!canTickItem(viewer.role, { ownerRole }, item.newHire.teamLeadId, viewer.id)) throw new AcademyError('Forbidden', 403)
  return tickItem(db, itemId, viewer.id, input, now)
}

/**
 * The items this person owns on one hire, for the pages they already use. HR can tick anything but
 * work from the tracker, so only a hire they lead shows here. Someone with no items gets an empty list.
 */
export async function listMyChecklist(
  db: PrismaClient, viewer: TrackerViewer, newHireId: string, now: Date = new Date(),
): Promise<ChecklistItemView[]> {
  const hire = await db.newHire.findUnique({ where: { id: newHireId }, select: { teamLeadId: true } })
  if (!hire) throw hireNotFound()
  const isLead = hire.teamLeadId === viewer.id
  const items = await listChecklist(db, newHireId, now)
  return items.filter(
    ({ ownerRole }) =>
      canTickItem(viewer.role, { ownerRole }, hire.teamLeadId, viewer.id) &&
      (viewer.role !== 'HR' || (ownerRole === 'TEAM_LEAD' && isLead)),
  )
}

/** The route is HR only. */
export async function clearHireQuiz(db: PrismaClient, newHireId: string, actorId: string): Promise<void> {
  const hire = await db.newHire.findUnique({ where: { id: newHireId }, select: { userId: true } })
  if (!hire?.userId) throw hireNotFound()
  await clearQuizAttempts(db, hire.userId)
  console.info('[academy] quiz attempts cleared', { newHireId, actorId })
}
