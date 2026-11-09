import { Prisma, type OnboardingProgress, type OnboardingProgressSource, type PrismaClient } from '@prisma/client'
import { sendAssignmentNotice } from '@/lib/email'
import { AcademyError } from '../errors'
import { parseProgressState } from '../progress'
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
/** Sends in one run, counted after the once-only check, so running it again reaches whoever is left. */
const MAX_SENDS = 500

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
function actionFor(onboardingCompleted: boolean, row: OnboardingProgress | undefined): Action {
  if (!row) return onboardingCompleted ? 'CREATE' : 'NONE'
  const inCourse = row.source === 'COURSE' && !onboardingCompleted
  if (row.status === 'COMPLETED') return inCourse ? 'REOPEN_IN_COURSE' : 'REOPEN'
  if (inCourse) return 'NONE'
  return row.source === 'COURSE' ? 'TAKE_OVER' : 'ALREADY_OPEN'
}

/** No due date: nobody shows as overdue through no fault of theirs. `assignedById` keeps recomputeDueDates off it. */
const clearedProgress = (actorId: string) => ({
  status: 'IN_PROGRESS' as const,
  startedAt: null,
  completedAt: null,
  versionId: null,
  dueAt: null,
  assignedById: actorId,
  // The mark explained the completion being cleared, so it goes with it.
  markedWatchedById: null,
  markedWatchedAt: null,
  markedWatchedReason: null,
})

type ClearedProgress = ReturnType<typeof clearedProgress> & { source?: OnboardingProgressSource }

/** The state goes, except a LinkedIn link: HR may still be verifying it and the person can't send it again. */
async function resetRows(tx: Tx, rows: readonly OnboardingProgress[], data: ClearedProgress): Promise<void> {
  const linkOf = (row: OnboardingProgress) => parseProgressState(row.state).linkedinUrl
  const withLink = rows.filter((row) => linkOf(row))
  await tx.onboardingProgress.updateMany({
    where: { id: { in: rows.filter((row) => !linkOf(row)).map((row) => row.id) } },
    data: { ...data, state: Prisma.DbNull },
  })
  for (const row of withLink) {
    await tx.onboardingProgress.update({
      where: { id: row.id },
      data: { ...data, state: { ...parseProgressState(null), linkedinUrl: linkOf(row) } },
    })
  }
}

/**
 * Who has finished, read under the lock finishing takes, so this can't cross a hire who is finishing.
 * Only people not finished can change, and locking just them leaves everyone else's account alone.
 */
async function lockFinishedIds(tx: Tx, users: readonly ActiveUser[]): Promise<Set<string>> {
  const unfinished = users.filter((user) => !user.onboardingCompleted).map((user) => user.id)
  const finished = users.filter((user) => user.onboardingCompleted).map((user) => user.id)
  if (unfinished.length === 0) return new Set(finished)
  const locked = await tx.$queryRaw<Array<{ id: string; onboardingCompleted: boolean }>>`
    SELECT id, "onboardingCompleted" FROM "User" WHERE id = ANY(${unfinished}) ORDER BY id FOR NO KEY UPDATE`
  return new Set([...finished, ...locked.filter((user) => user.onboardingCompleted).map((user) => user.id)])
}

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

/** One transaction. The rows are locked first, so a reopen can't cross a completion or another call. */
async function reopenFor(
  db: PrismaClient, moduleId: string, targets: AssignTargets, newSource: OnboardingProgressSource, actorId: string,
): Promise<ReopenResult> {
  const users = await activeUsers(db, targets)
  return db.$transaction(async (tx) => {
    const module = await findCourseModuleById(tx, moduleId)
    // Users before progress rows: the order the payout save takes them in.
    const finished = await lockFinishedIds(tx, users)
    await tx.$queryRaw`SELECT id FROM "OnboardingProgress" WHERE "moduleId" = ${moduleId} ORDER BY id FOR UPDATE`
    const rows = await tx.onboardingProgress.findMany({ where: { moduleId, userId: { in: users.map((u) => u.id) } } })
    const rowOf = new Map(rows.map((row) => [row.userId, row]))
    const planned = users.map((user) => ({ user, row: rowOf.get(user.id), action: actionFor(finished.has(user.id), rowOf.get(user.id)) }))
    const withAction = (...actions: Action[]) => planned.filter((p) => actions.includes(p.action))
    const rowsWith = (...actions: Action[]) => withAction(...actions).flatMap((p) => (p.row ? [p.row] : []))

    await archive(tx, rowsWith('REOPEN', 'REOPEN_IN_COURSE'))
    await resetRows(tx, rowsWith('REOPEN_IN_COURSE'), clearedProgress(actorId))
    await resetRows(tx, rowsWith('REOPEN'), { ...clearedProgress(actorId), source: 'REREAD' })
    await resetRows(tx, rowsWith('TAKE_OVER'), { ...clearedProgress(actorId), source: newSource })
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

type SendAssignment = (input: { to: string; name: string; title: string; slug: string; inCourse: boolean }) => Promise<SendResult>

export interface NotifyOptions {
  send?: SendAssignment
  now?: Date
  limit?: number
}

/**
 * For `after()`: never throws. Sends a few at a time, one notice per person, module, version and UTC day,
 * so a reopen on a later day is heard and a same-day repeat is not. A failure is logged by its key, which
 * holds ids only. Nobody who is cut off or failed loses out: running the assign again reaches them.
 */
export async function notifyAssigned(
  db: PrismaClient, notice: AssignmentNotice,
  { send = sendAssignmentNotice, now = new Date(), limit = MAX_SENDS }: NotifyOptions = {},
): Promise<void> {
  const { moduleId, versionId, userIds } = notice
  const date = now.toISOString().slice(0, 10)
  try {
    const module = await db.onboardingModule.findUnique({ where: { id: moduleId }, select: { slug: true, title: true } })
    if (!module) return
    const users = await db.user.findMany({
      where: { id: { in: userIds }, email: { not: null } },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, email: true, onboardingCompleted: true },
    })
    let attempts = 0
    for (let start = 0; start < users.length && attempts < limit; start += NOTICE_BATCH) {
      const deliveries = await Promise.all(users.slice(start, start + NOTICE_BATCH).map((user) =>
        sendRouteNotice(db, `assign:${user.id}:${moduleId}:${versionId}:${date}`, () =>
          send({ to: user.email ?? '', name: user.name, title: module.title, slug: module.slug, inCourse: !user.onboardingCompleted })),
      ))
      attempts += deliveries.filter((delivery) => delivery !== 'ALREADY_SENT').length
    }
    if (attempts >= limit) console.error('[academy] assignment notices cut off: run the assign again', { moduleId, limit })
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
  // One query for everyone: inactive is the same test as isAccountInactive (a profile marked
  // not active; no profile means active), done in the database instead of once per person.
  const people = await db.user.findMany({
    where: {
      NOT: { payrollProfile: { is: { isPayrollActive: false } } },
      OR: [{ onboardingCompleted: true }, { newHireRecord: { is: { academyReleasedAt: { not: null } } } }],
    },
    select: { id: true, name: true, department: true },
    orderBy: { name: 'asc' },
  })
  return {
    modules: modules.map((module, index) => ({ id: module.id, number: index + 1, title: module.title })),
    people: [...people].sort((a, b) => a.name.localeCompare(b.name)),
  }
}
