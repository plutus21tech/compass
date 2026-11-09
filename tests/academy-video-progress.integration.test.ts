import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { AcademyError } from '../lib/academy/errors'
import { parseProgressState } from '../lib/academy/progress'
import { loadModule } from '../lib/academy/service/course'
import { completeModule, recordEvent } from '../lib/academy/service/progress'
import { readTranscript } from '../lib/academy/service/transcript'
import type { VideoConfig } from '../lib/academy/video'
import type { ModuleBlockView } from '../lib/academy/view'
import { ACADEMY_DB_TEST, P } from './helpers/academy-test-db'
import { HIRE_ID, cleanCourse, createReleasedHire, progressRow, scrollAndComplete } from './helpers/academy-course-fixtures'
import { WEEKLY_DB_READY } from './helpers/weekly-test-db'

const fails = (status: number, message?: RegExp) => (error: unknown) => {
  assert.ok(error instanceof AcademyError, String(error))
  assert.equal(error.status, status)
  if (message) assert.match(error.message, message)
  return true
}

after(async () => {
  if (WEEKLY_DB_READY) await cleanCourse()
  await prisma.$disconnect()
})

const T0 = new Date('2026-12-01T09:00:00.000Z')
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000)

const VIDEO: VideoConfig = {
  youtubeId: 'abcdefghijk',
  durationSeconds: 200,
  chapters: [{ key: 'intro', label: 'Intro', start: 0 }, { key: 'people', label: 'Our people', start: 60 }],
  transcripts: { en: 'Hello and welcome.', fr: '' },
}

async function setVideos(videos: Record<string, VideoConfig>): Promise<void> {
  await prisma.onboardingConfig.upsert({
    where: { id: 'singleton' },
    update: { videos: videos as object },
    create: { id: 'singleton', videos: videos as object },
  })
}

const videoBlock = (blocks: readonly ModuleBlockView[]) => {
  const block = blocks.find((b) => b.type === 'video')
  assert.ok(block && block.type === 'video')
  return block
}

const report = (seconds: number, now: Date) => recordEvent(prisma, HIRE_ID, 'welcome', { type: 'VIDEO_PROGRESS', seconds }, now)
const furthest = async () => parseProgressState((await progressRow('welcome')).state).video?.furthest

test('an unready video keeps the rule at SCROLL_END and refuses progress', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  const view = await loadModule(prisma, HIRE_ID, 'welcome', T0)
  assert.equal(view.progress.effectiveRule, 'SCROLL_END')
  assert.deepEqual(videoBlock(view.blocks), { ...videoBlock(view.blocks), ready: false })
  assert.equal('youtubeId' in videoBlock(view.blocks), false)
  await assert.rejects(report(10, at(10)), fails(400))
})

test('a ready video makes the rule VIDEO_95 and shows the player details', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await setVideos({ VIDEO_1: VIDEO })
  const view = await loadModule(prisma, HIRE_ID, 'welcome', T0)
  assert.equal(view.progress.effectiveRule, 'VIDEO_95')
  const block = videoBlock(view.blocks)
  assert.ok(block.ready)
  assert.equal(block.youtubeId, VIDEO.youtubeId)
  assert.equal(block.durationSeconds, 200)
  assert.deepEqual(block.chapters, VIDEO.chapters)
  assert.deepEqual(block.transcriptLanguages, ['en'])
  assert.equal(block.furthest, 0)
  assert.equal(block.completed, false)
  assert.equal('transcripts' in block, false)
})

test('a first report an hour after the start gains at most 48', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await setVideos({ VIDEO_1: VIDEO })
  await loadModule(prisma, HIRE_ID, 'welcome', T0)
  await report(VIDEO.durationSeconds, at(3600))
  assert.ok((await furthest())! <= 48)
})

test('posting 600 seconds right after the start gives at most 15', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await setVideos({ VIDEO_1: VIDEO })
  await loadModule(prisma, HIRE_ID, 'welcome', T0)
  await report(600, T0)
  assert.ok((await furthest())! <= 15)
})

test('completing early gives 409, and scrolling is not enough', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await setVideos({ VIDEO_1: VIDEO })
  await loadModule(prisma, HIRE_ID, 'welcome', T0)
  await recordEvent(prisma, HIRE_ID, 'welcome', { type: 'SCROLLED_END' }, at(1))
  await report(100, at(100))
  await assert.rejects(completeModule(prisma, HIRE_ID, 'welcome'), fails(409))
  assert.equal((await progressRow('welcome')).status, 'IN_PROGRESS')
})

test('reports every 10 seconds reach 95% only after about 95% of the duration, then it completes', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await setVideos({ VIDEO_1: VIDEO })
  await loadModule(prisma, HIRE_ID, 'welcome', T0)
  // 95% of 200 is 190: no sooner than real time × 1.1 plus one 15-second tolerance allows.
  for (let t = 10; t <= 150; t += 10) {
    const view = await report(VIDEO.durationSeconds, at(t))
    assert.equal(view.completion.met, false, `met at ${t}s`)
  }
  assert.equal((await report(VIDEO.durationSeconds, at(160))).completion.met, true)
  await completeModule(prisma, HIRE_ID, 'welcome')
  assert.equal((await progressRow('welcome')).status, 'COMPLETED')
})

test('furthest never drops', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await setVideos({ VIDEO_1: VIDEO })
  await loadModule(prisma, HIRE_ID, 'welcome', T0)
  for (let t = 10; t <= 80; t += 10) await report(t, at(t))
  await report(20, at(90))
  assert.equal(await furthest(), 80)
})

test('a completed row is unchanged after a config change and ignores progress', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await scrollAndComplete('welcome')
  const before = await progressRow('welcome')
  await setVideos({ VIDEO_1: VIDEO })
  const view = await loadModule(prisma, HIRE_ID, 'welcome')
  assert.equal(view.progress.status, 'COMPLETED')
  const block = videoBlock(view.blocks)
  assert.ok(block.ready)
  assert.equal(block.completed, true)
  await report(150, new Date())
  assert.deepEqual(await progressRow('welcome'), before)
})

test('an ID change with the same duration keeps furthest; a duration change restarts a half-watched row', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await setVideos({ VIDEO_1: VIDEO })
  await loadModule(prisma, HIRE_ID, 'welcome', T0)
  for (let t = 10; t <= 100; t += 10) await report(t, at(t))
  assert.equal(await furthest(), 100)

  await setVideos({ VIDEO_1: { ...VIDEO, youtubeId: 'zyxwvutsrqp' } })
  const kept = videoBlock((await loadModule(prisma, HIRE_ID, 'welcome')).blocks)
  assert.ok(kept.ready)
  assert.equal(kept.furthest, 100)

  await setVideos({ VIDEO_1: { ...VIDEO, durationSeconds: 400 } })
  const restartedView = videoBlock((await loadModule(prisma, HIRE_ID, 'welcome')).blocks)
  assert.ok(restartedView.ready)
  assert.equal(restartedView.furthest, 0)
  await report(110, at(110))
  const state = parseProgressState((await progressRow('welcome')).state)
  assert.equal(state.video?.durationSeconds, 400)
  assert.ok(state.video!.furthest <= 15)
})

test('the transcript serves the hire who can open the module, and HR', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await setVideos({ VIDEO_1: VIDEO, VIDEO_2: { ...VIDEO, transcripts: { en: 'Our values.' } } })
  assert.equal(await readTranscript(prisma, { id: HIRE_ID, role: 'EMPLOYEE' }, 'VIDEO_1', 'en'), 'Hello and welcome.')
  assert.equal(await readTranscript(prisma, { id: P.hr.id, role: 'HR' }, 'VIDEO_2', 'en'), 'Our values.')
})

test('the transcript route refuses someone who cannot open the module', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await setVideos({ VIDEO_1: VIDEO, VIDEO_2: VIDEO })
  await assert.rejects(readTranscript(prisma, { id: P.staff.id, role: 'EMPLOYEE' }, 'VIDEO_1', 'en'), fails(403))
  await assert.rejects(readTranscript(prisma, { id: P.oa.id, role: 'OA' }, 'VIDEO_1', 'en'), fails(403))
  // Module 2 is still locked for the hire.
  await assert.rejects(readTranscript(prisma, { id: HIRE_ID, role: 'EMPLOYEE' }, 'VIDEO_2', 'en'), fails(403))
})

test('a missing or empty transcript language is 404, as is an unknown video', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await setVideos({ VIDEO_1: VIDEO })
  const hire = { id: HIRE_ID, role: 'EMPLOYEE' as const }
  await assert.rejects(readTranscript(prisma, hire, 'VIDEO_1', 'fr'), fails(404))
  await assert.rejects(readTranscript(prisma, hire, 'VIDEO_1', 'es'), fails(404))
  await assert.rejects(readTranscript(prisma, hire, 'VIDEO_1', 'de'), fails(404))
  await assert.rejects(readTranscript(prisma, hire, 'VIDEO_9', 'en'), fails(404))
  await assert.rejects(readTranscript(prisma, { id: P.hr.id, role: 'HR' }, 'VIDEO_2', 'en'), fails(404))
})

test('a late report on a completed row is accepted and changes nothing, even after the video went unready', ACADEMY_DB_TEST, async () => {
  await createReleasedHire()
  await setVideos({ VIDEO_1: VIDEO })
  await loadModule(prisma, HIRE_ID, 'welcome', T0)
  for (let t = 10; t <= 160; t += 10) await report(VIDEO.durationSeconds, at(t))
  await completeModule(prisma, HIRE_ID, 'welcome')
  const before = await progressRow('welcome')
  await setVideos({})
  const view = await report(VIDEO.durationSeconds, at(170))
  assert.equal(view.status, 'COMPLETED')
  assert.deepEqual(await progressRow('welcome'), before)
})
