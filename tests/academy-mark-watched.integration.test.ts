import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { AcademyError } from '../lib/academy/errors'
import { parseProgressState } from '../lib/academy/progress'
import { loadModule } from '../lib/academy/service/course'
import { markWatched, markWatchedBodySchema } from '../lib/academy/service/mark-watched'
import { readCourseProgress } from '../lib/academy/service/progress'
import { loadDrawer } from '../lib/academy/service/tracker'
import type { VideoConfig } from '../lib/academy/video'
import { ACADEMY_DB_TEST, P } from './helpers/academy-test-db'
import { HIRE_ID, NEW_HIRE_ID, SLUGS, cleanCourse, createReleasedHire, progressRow, scrollAndComplete } from './helpers/academy-course-fixtures'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'

const fails = (status: number) => (error: unknown) => {
  assert.ok(error instanceof AcademyError, String(error))
  assert.equal(error.status, status)
  return true
}

after(async () => {
  if (WEEKLY_DB_READY) await cleanCourse()
  await prisma.$disconnect()
})

const VIDEO: VideoConfig = {
  youtubeId: 'abcdefghijk',
  durationSeconds: 200,
  chapters: [{ key: 'intro', label: 'Intro', start: 0 }],
  transcripts: { en: 'Hello.' },
}

async function setVideos(videos: Record<string, VideoConfig>): Promise<void> {
  await prisma.onboardingConfig.upsert({
    where: { id: 'singleton' },
    update: { videos: videos as object },
    create: { id: 'singleton', videos: videos as object },
  })
}

const HR = { id: P.hr.id, role: 'HR' }
const REASON = 'The player would not load on their laptop; we watched it together on a call.'
const moduleId = async (slug: string) => (await progressRow(slug)).moduleId

test('HR marks a ready video watched: the module completes, pinned, logged, and the next row opens', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await setVideos({ VIDEO_1: VIDEO })
  await loadModule(prisma, HIRE_ID, SLUGS[0])
  await markWatched(prisma, HR, NEW_HIRE_ID, await moduleId(SLUGS[0]), REASON)

  const row = await progressRow(SLUGS[0])
  assert.equal(row.status, 'COMPLETED')
  assert.ok(row.completedAt)
  const module = await prisma.onboardingModule.findUniqueOrThrow({ where: { id: row.moduleId } })
  assert.equal(row.versionId, module.currentVersionId)
  const video = parseProgressState(row.state).video
  assert.equal(video?.furthest, 200)
  assert.equal(video?.durationSeconds, 200)
  assert.equal(row.markedWatchedById, P.hr.id)
  assert.equal(row.markedWatchedReason, REASON)
  assert.ok(row.markedWatchedAt)
  assert.equal((await progressRow(SLUGS[1])).status, 'IN_PROGRESS')

  const drawer = await loadDrawer(prisma, { id: P.hr.id, role: 'HR' }, NEW_HIRE_ID)
  const first = drawer.modules[0]
  assert.equal(first.markWatchable, false)
  assert.deepEqual(
    { reason: first.markedWatched?.reason, by: first.markedWatched?.byName },
    { reason: REASON, by: P.hr.name },
  )
})

test('the drawer offers Mark watched only on an open, incomplete module with a ready video', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const before = await loadDrawer(prisma, { id: P.hr.id, role: 'HR' }, NEW_HIRE_ID)
  assert.equal(before.modules.some((m) => m.markWatchable), false)
  await setVideos({ VIDEO_1: VIDEO, VIDEO_2: VIDEO })
  const after = await loadDrawer(prisma, { id: P.hr.id, role: 'HR' }, NEW_HIRE_ID)
  // Module 2 is still locked, so only Module 1 can be marked.
  assert.deepEqual(after.modules.map((m) => m.markWatchable).slice(0, 3), [true, false, false])
})

test('only HR can mark a video watched', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await setVideos({ VIDEO_1: VIDEO })
  const id = await moduleId(SLUGS[0])
  for (const role of ['OA', 'EMPLOYEE', 'SECURITY']) {
    await assert.rejects(markWatched(prisma, { id: P.staff.id, role }, NEW_HIRE_ID, id, REASON), fails(403))
  }
  assert.equal((await progressRow(SLUGS[0])).status, 'IN_PROGRESS')
})

test('a reason is required', ACADEMY_DB_TEST, async () => {
  assert.equal(markWatchedBodySchema.safeParse({ moduleId: 'm', reason: '   ' }).success, false)
  assert.equal(markWatchedBodySchema.safeParse({ moduleId: 'm' }).success, false)
  assert.equal(markWatchedBodySchema.safeParse({ moduleId: 'm', reason: 'x'.repeat(501) }).success, false)
  assert.equal(markWatchedBodySchema.safeParse({ moduleId: 'm', reason: REASON }).success, true)
  await createReleasedHire()
  await setVideos({ VIDEO_1: VIDEO })
  await assert.rejects(markWatched(prisma, HR, NEW_HIRE_ID, await moduleId(SLUGS[0]), '  '), fails(400))
  assert.equal((await progressRow(SLUGS[0])).status, 'IN_PROGRESS')
})

test('no ready video, a locked row or a module without a video is refused; a completed one is left alone', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await assert.rejects(markWatched(prisma, HR, NEW_HIRE_ID, await moduleId(SLUGS[0]), REASON), fails(409))
  await setVideos({ VIDEO_1: VIDEO, VIDEO_2: VIDEO })
  await assert.rejects(markWatched(prisma, HR, NEW_HIRE_ID, await moduleId(SLUGS[1]), REASON), fails(409))
  await assert.rejects(markWatched(prisma, HR, NEW_HIRE_ID, await moduleId(SLUGS[2]), REASON), fails(409))
  await assert.rejects(markWatched(prisma, HR, 'act-nope', await moduleId(SLUGS[0]), REASON), fails(404))
  await assert.rejects(markWatched(prisma, HR, NEW_HIRE_ID, 'act-nope', REASON), fails(404))

  await setVideos({})
  await scrollAndComplete(SLUGS[0])
  await setVideos({ VIDEO_1: VIDEO })
  const done = await progressRow(SLUGS[0])
  await markWatched(prisma, HR, NEW_HIRE_ID, done.moduleId, REASON)
  assert.deepEqual(await progressRow(SLUGS[0]), done)
})

test('marking both videos watched leaves the quiz waiting for all 14 modules', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await setVideos({ VIDEO_1: VIDEO, VIDEO_2: VIDEO })
  await markWatched(prisma, HR, NEW_HIRE_ID, await moduleId(SLUGS[0]), REASON)
  await markWatched(prisma, HR, NEW_HIRE_ID, await moduleId(SLUGS[1]), REASON)
  assert.equal((await progressRow(SLUGS[1])).status, 'COMPLETED')
  assert.equal((await progressRow(SLUGS[2])).status, 'IN_PROGRESS')
  assert.equal((await readCourseProgress(prisma, HIRE_ID)).modulesDone, false)
})
