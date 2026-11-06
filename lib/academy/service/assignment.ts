import { Prisma, type OnboardingProgress, type OnboardingProgressSource, type PrismaClient } from '@prisma/client'
import { sendAssignmentNotice } from '@/lib/email'
import { AcademyError } from '../errors'
import type { AssignedCardView } from '../view'
import { sendRouteNotice, type SendResult } from './notify'
import { listCourseModules, type CourseModule } from './progress'
import { isAccountInactive } from './shared-reads'

export type { AssignedCardView } from '../view'

type Tx = Prisma.TransactionClient

/** "All active" writes a row per person: longer than one person's course writes. */
const ASSIGN_TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const
const ACTIVE_CHECK_BATCH = 20
const NOTICE_BATCH = 5
const MAX_NOTICES = 500

export type AssignTargets = readonly string[] | 'ALL_ACTIVE'

/** Everyone who should hear about this module and version. Goes to notifyAssigned after the commit. */
export interface AssignmentNotice {
  moduleId: string
  versionId: string
  userIds: string[]
}

async function inBatches<T, R>(items: readonly T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let start = 0; start < items.length; start += size) {
    results.push(...(await Promise.all(items.slice(start, start + size).map(run))))
  }
  return results
}

const ACTIVE_SELECT = {
  id: true,
  name: true,
  department: true,
  onboardingCompleted: true,
  newHireRecord: { select: { academyReleasedAt: true } },
} satisfies Prisma.UserSelect

type ActiveUser = Prisma.UserGetPayload<{ select: typeof ACTIVE_SELECT }>

/** Read before the transaction opens: there is one lookup per person. */
async function activeUsers(db: PrismaClient, targets: AssignTargets): Promise<ActiveUser[]> {
  const users = await db.user.findMany({
    where: targets === 'ALL_ACTIVE' ? {} : { id: { in: [...new Set(targets)] } },
    select: ACTIVE_SELECT,
  })
  const inactive = await inBatches(users, ACTIVE_CHECK_BATCH, (user) => isAccountInactive(db, user.id))
  return users.filter((_, index) => !inactive[index])
}

type Action = 'CREATE' | 'REOPEN' | 'REOPEN_IN_COURSE' | 'TAKE_OVER' | 'ALREADY_OPEN' | 'NONE'

/**
 * Nothing here changes `onboardingCompleted`. A hire still in the course keeps their COURSE row, so
 * `readCourseProgress` stays right. A hire not yet released has no way into a new row, and a locked
 * course row stays locked. Someone who finished has no course left, so an open COURSE row is theirs to take.
 */
function actionFor(user: ActiveUser, row: OnboardingProgress | undefined): Action {
  if (!row) return user.onboardingCompleted ? 'CREATE' : 'NONE'
  const inCourse = row.source === 'COURSE' && !user.onboardingCompleted
  if (row.status === 'COMPLETED') return inCourse ? 'REOPEN_IN_COURSE' : 'REOPEN'
  if (inCourse) return 'NONE'
  return row.source === 'COURSE' ? 'TAKE_OVER' : 'ALREADY_OPEN'
}

const clearedProgress = (actorId: string) => ({
  status: 'IN_PROGRESS' as const,
  startedAt: null,
  completedAt: null,
  versionId: null,
  state: Prisma.DbNull,
  assignedById: actorId,
})

async function archive(tx: Tx, rows: readonly OnboardingProgress[]): Promise<void> {
  await tx.onboardingProgressHistory.createMany({
    data: rows.map((row) => ({
      userId: row.userId,
      moduleId: row.moduleId,
      versionId: row.versionId,
      completedAt: row.completedAt ?? row.updatedAt,
    })),
  })
}

async function findCourseModuleById(tx: Tx, moduleId: string): Promise<CourseModule> {
  const module = (await listCourseModules(tx)).find((m) => m.id === moduleId)
  if (!module) throw new AcademyError('Module not found', 404)
  return module
}

interface ReopenResult { count: number; notice: AssignmentNotice }

/** One transaction. The module's rows are locked first, so a reopen can't cross a completion or another call. */
async function reopenFor(
  db: PrismaClient, moduleId: string, targets: AssignTargets, newSource: OnboardingProgressSource, actorId: string,
): Promise<ReopenResult> {
  const users = await activeUsers(db, targets)
  return db.$transaction(async (tx) => {
    const module = await findCourseModuleById(tx, moduleId)
    await tx.$queryRaw`SELECT id FROM "OnboardingProgress" WHERE "moduleId" = ${moduleId} ORDER BY id FOR UPDATE`
    const rows = await tx.onboardingProgress.findMany({ where: { moduleId, userId: { in: users.map((u) => u.id) } } })
    const rowOf = new Map(rows.map((row) => [row.userId, row]))
    const planned = users.map((user) => ({ user, row: rowOf.get(user.id), action: actionFor(user, rowOf.get(user.id)) }))
    const withAction = (...actions: Action[]) => planned.filter((p) => actions.includes(p.action))
    const rowsWith = (...actions: Action[]) => withAction(...actions).flatMap((p) => (p.row ? [p.row] : []))
    const idsOf = (list: readonly OnboardingProgress[]) => ({ id: { in: list.map((row) => row.id) } })

    await archive(tx, rowsWith('REOPEN', 'REOPEN_IN_COURSE'))
    await tx.onboardingProgress.updateMany({ where: idsOf(rowsWith('REOPEN_IN_COURSE')), data: clearedProgress(actorId) })
    await tx.onboardingProgress.updateMany({ where: idsOf(rowsWith('REOPEN')), data: { ...clearedProgress(actorId), source: 'REREAD', dueAt: null } })
    await tx.onboardingProgress.updateMany({ where: idsOf(rowsWith('TAKE_OVER')), data: { ...clearedProgress(actorId), source: newSource, dueAt: null } })
    await tx.onboardingProgress.createMany({
      data: withAction('CREATE').map(({ user }) => ({ userId: user.id, moduleId, status: 'IN_PROGRESS' as const, source: newSource, assignedById: actorId })),
      skipDuplicates: true,
    })

    const changed = withAction('CREATE', 'REOPEN', 'REOPEN_IN_COURSE', 'TAKE_OVER')
    // Rows already open are on the list too: the once-only log stops a repeat, and retries a send that failed.
    const heard = [...changed, ...withAction('ALREADY_OPEN')]
    return {
      count: changed.length,
      notice: { moduleId, versionId: module.currentVersionId, userIds: heard.map((p) => p.user.id) },
    }
  }, ASSIGN_TX_OPTIONS)
}

/** Gives each person one module without touching their access (D2). Pass `notice` to notifyAssigned after this returns. */
export async function assignModule(
  db: PrismaClient, moduleId: string, userIds: AssignTargets, actorId: string,
): Promise<{ assigned: number; notice: AssignmentNotice }> {
  const { count, notice } = await reopenFor(db, moduleId, userIds, 'SINGLE_ASSIGNMENT', actorId)
  return { assigned: count, notice }
}

/** Reopens a module for all active employees. Pass `notice` to notifyAssigned after this returns. */
export async function requestReread(
  db: PrismaClient, moduleId: string, actorId: string,
): Promise<{ reopened: number; notice: AssignmentNotice }> {
  const { count, notice } = await reopenFor(db, moduleId, 'ALL_ACTIVE', 'REREAD', actorId)
  return { reopened: count, notice }
}

type SendAssignment = (input: { to: string; name: string; title: string; slug: string }) => Promise<SendResult>

/**
 * For `after()`: never throws. Sends a few at a time up to a limit, one notice per person, module and
 * version. A failure is logged by its key, which holds ids only, and running the assign again retries it.
 */
export async function notifyAssigned(
  db: PrismaClient, notice: AssignmentNotice, send: SendAssignment = sendAssignmentNotice,
): Promise<void> {
  const { moduleId, versionId, userIds } = notice
  try {
    if (userIds.length > MAX_NOTICES) console.error('[academy] assignment notices cut off', { moduleId, total: userIds.length })
    const module = await db.onboardingModule.findUnique({ where: { id: moduleId }, select: { slug: true, title: true } })
    if (!module) return
    const users = await db.user.findMany({
      where: { id: { in: userIds.slice(0, MAX_NOTICES) } },
      select: { id: true, name: true, email: true },
    })
    await inBatches(users, NOTICE_BATCH, (user) =>
      sendRouteNotice(db, `assign:${user.id}:${moduleId}:${versionId}`, () =>
        send({ to: user.email ?? '', name: user.name, title: module.title, slug: module.slug })),
    )
  } catch (error) {
    console.error('[academy] assignment notices could not be sent', { moduleId, error: error instanceof Error ? error.name : 'unknown' })
  }
}

/** Open assigned and re-read modules, in course order. A COURSE row belongs to the course, not this card. */
export async function loadAssigned(db: PrismaClient, userId: string): Promise<AssignedCardView[]> {
  const modules = await listCourseModules(db)
  const rows = await db.onboardingProgress.findMany({
    where: {
      userId,
      moduleId: { in: modules.map((m) => m.id) },
      source: { in: ['SINGLE_ASSIGNMENT', 'REREAD'] },
      status: { not: 'COMPLETED' },
    },
    select: { moduleId: true, source: true },
  })
  return modules.flatMap((module) => {
    const row = rows.find((r) => r.moduleId === module.id)
    if (!row) return []
    return [{ slug: module.slug, title: module.title, estimatedMinutes: module.estimatedMinutes ?? 0, reread: row.source === 'REREAD' }]
  })
}

export interface AssignableView {
  modules: Array<{ id: string; number: number; title: string }>
  people: Array<{ id: string; name: string; department: string | null }>
}

/** For HR's picker: the same people an assignment would reach. */
export async function listAssignable(db: PrismaClient): Promise<AssignableView> {
  const modules = await listCourseModules(db)
  const users = await activeUsers(db, 'ALL_ACTIVE')
  return {
    modules: modules.map((module, index) => ({ id: module.id, number: index + 1, title: module.title })),
    people: users
      .filter((user) => user.onboardingCompleted || user.newHireRecord?.academyReleasedAt)
      .map(({ id, name, department }) => ({ id, name, department }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}
