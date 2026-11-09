import type { OnboardingProgress, Prisma, PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { canManageOnboarding } from '@/lib/permissions'
import { AcademyError } from '../errors'
import { nextToUnlock, parseProgressState, type ProgressState } from '../progress'
import type { VideoConfig } from '../video'
import { moduleVideo } from '../view'
import { loadRowFacts } from './context'
import { getAcademyConfig } from './library'
import { COURSE_TX_OPTIONS, listCourseModules, lockProgressRow, moduleBlocks, type CourseModule } from './progress'

type Db = PrismaClient | Prisma.TransactionClient

export const MARK_WATCHED_REASON_MAX = 500
const REASON_REQUIRED = 'Add a reason first.'
const NO_VIDEO_MESSAGE = 'This module has no ready video to mark as watched.'
const NOT_OPEN_MESSAGE = "This module isn't open for them yet."
const NOT_RELEASED_MESSAGE = "This hire's course hasn't been released yet."

const reasonSchema = z.string().trim().min(1, REASON_REQUIRED).max(MARK_WATCHED_REASON_MAX)

export const markWatchedBodySchema = z.object({ moduleId: z.string().min(1).max(100), reason: reasonSchema }).strict()

const moduleNotFound = () => new AcademyError('Module not found', 404)

type WatchRow = Pick<OnboardingProgress, 'source' | 'status' | 'unlockedEarlyById'>

/**
 * The ready video this hire is shown on an open, unfinished course row of a VIDEO_95 module, or null.
 * The same test decides whether the tracker offers the action and whether the server takes it.
 */
export async function watchableVideo(
  db: Db, userId: string, row: WatchRow, module: CourseModule,
): Promise<VideoConfig | null> {
  if (row.source !== 'COURSE' || row.status === 'COMPLETED' || module.completionRule !== 'VIDEO_95') return null
  if (row.status === 'LOCKED' && !row.unlockedEarlyById) return null
  const facts = await loadRowFacts(db, userId, row)
  if (!facts) return null
  const blocks = await moduleBlocks(db, module.currentVersionId, facts, true)
  return moduleVideo(blocks, (await getAcademyConfig(db)).videos)?.video ?? null
}

/** Watched to the end, as a real watch would leave it. */
const watchedState = (state: ProgressState, video: VideoConfig, now: Date): ProgressState => ({
  ...state,
  video: { furthest: video.durationSeconds, reportedAt: now.toISOString(), durationSeconds: video.durationSeconds },
})

/**
 * HR unblocks a hire whose ready video won't load (R5). Under the row lock it completes the module the
 * way a real watch would: full duration, version pinned, next row opened. Who, when and why are kept on
 * the row. A finished module is left as it is. HR only; the quiz still waits for every module.
 */
export async function markWatched(
  db: PrismaClient, actor: { id: string; role: string }, newHireId: string, moduleId: string, reason: string,
  now: Date = new Date(),
): Promise<void> {
  if (!canManageOnboarding(actor.role)) throw new AcademyError('Forbidden', 403)
  const parsed = reasonSchema.safeParse(reason)
  if (!parsed.success) throw new AcademyError(parsed.error.issues[0]?.message ?? REASON_REQUIRED, 400)
  const hire = await db.newHire.findUnique({ where: { id: newHireId }, select: { userId: true, academyReleasedAt: true } })
  if (!hire) throw new AcademyError('New hire not found', 404)
  if (!hire.academyReleasedAt) throw new AcademyError(NOT_RELEASED_MESSAGE, 409)
  const { userId } = hire
  if (!userId) throw moduleNotFound()

  await db.$transaction(async (tx) => {
    const modules = await listCourseModules(tx)
    const module = modules.find((m) => m.id === moduleId)
    if (!module) throw moduleNotFound()
    const row = await lockProgressRow(tx, userId, moduleId)
    if (row.source !== 'COURSE') throw moduleNotFound()
    if (row.status === 'COMPLETED') return
    if (row.status === 'LOCKED' && !row.unlockedEarlyById) throw new AcademyError(NOT_OPEN_MESSAGE, 409)
    const video = await watchableVideo(tx, userId, row, module)
    if (!video) throw new AcademyError(NO_VIDEO_MESSAGE, 409)

    const state = watchedState(parseProgressState(row.state), video, now)
    await tx.onboardingProgress.update({
      where: { id: row.id },
      data: {
        status: 'COMPLETED', completedAt: now, versionId: module.currentVersionId, startedAt: row.startedAt ?? now,
        state: state as unknown as Prisma.InputJsonObject,
        markedWatchedById: actor.id, markedWatchedAt: now, markedWatchedReason: parsed.data,
      },
    })
    const nextId = nextToUnlock(modules, module.id)
    if (nextId) {
      await tx.onboardingProgress.updateMany({ where: { userId, moduleId: nextId, status: 'LOCKED' }, data: { status: 'IN_PROGRESS' } })
    }
    console.info('[academy] video marked watched', { newHireId, moduleId, actorId: actor.id })
  }, COURSE_TX_OPTIONS)
}
