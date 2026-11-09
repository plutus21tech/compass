import test from 'node:test'
import assert from 'node:assert/strict'
import { chapterStart, isVideoReady, parseDurationInput, readVideo, videoConfigSchema, videoConfigsSchema } from '../lib/academy/video'
import type { PrismaClient } from '@prisma/client'
import { AcademyError } from '../lib/academy/errors'
import { getVideoSettings, saveVideo } from '../lib/academy/service/videos'
import { withAcademyNav } from '../components/layout/sidebar-nav'
import type { SidebarConfig } from '../components/layout/AppSidebar'

const valid = {
  youtubeId: 'dQw4w9WgXcQ',
  durationSeconds: 390,
  chapters: [
    { key: 'innovation', label: 'Innovation', start: 0 },
    { key: 'integrity', label: 'Integrity', start: 120 },
  ],
  transcripts: { en: 'Welcome to the team.' },
}

test('a valid video config parses', () => {
  assert.ok(videoConfigSchema.safeParse(valid).success)
  assert.ok(videoConfigsSchema.safeParse({ VIDEO_1: valid }).success)
  assert.ok(videoConfigsSchema.safeParse({}).success)
})

test('a bad YouTube ID is refused', () => {
  for (const youtubeId of ['short', 'dQw4w9WgXcQ1', 'dQw4w9WgX!Q', '']) {
    assert.equal(videoConfigSchema.safeParse({ ...valid, youtubeId }).success, false, youtubeId)
  }
})

test('chapters must start at 0, ascend, be unique and fall inside the duration', () => {
  const withChapters = (chapters: unknown) => videoConfigSchema.safeParse({ ...valid, chapters }).success
  assert.equal(withChapters([{ key: 'a', label: 'A', start: 5 }]), false)
  assert.equal(withChapters([{ key: 'a', label: 'A', start: 0 }, { key: 'b', label: 'B', start: 100 }, { key: 'c', label: 'C', start: 50 }]), false)
  assert.equal(withChapters([{ key: 'a', label: 'A', start: 0 }, { key: 'b', label: 'B', start: 0 }]), false)
  assert.equal(withChapters([{ key: 'a', label: 'A', start: 0 }, { key: 'b', label: 'B', start: 390 }]), false)
  assert.equal(withChapters([]), false)
  assert.equal(withChapters([{ key: 'a', label: 'A', start: 0 }, { key: 'a', label: 'A2', start: 10 }]), false)
})

test('a duration out of range is refused', () => {
  for (const durationSeconds of [29, 7201, 60.5, -1]) {
    assert.equal(videoConfigSchema.safeParse({ ...valid, durationSeconds }).success, false, String(durationSeconds))
  }
  assert.ok(videoConfigSchema.safeParse({ ...valid, durationSeconds: 7200 }).success)
})

test('transcripts are capped at 100,000 characters', () => {
  assert.equal(videoConfigSchema.safeParse({ ...valid, transcripts: { en: 'x'.repeat(100001) } }).success, false)
  assert.ok(videoConfigSchema.safeParse({ ...valid, transcripts: { fr: 'x'.repeat(100000) } }).success)
})

test('readVideo returns null for junk and never throws', () => {
  for (const junk of [null, undefined, 5, 'x', [], {}, { VIDEO_1: 'junk' }, { VIDEO_1: { ...valid, youtubeId: 'bad' } }]) {
    assert.equal(readVideo(junk, 'VIDEO_1'), null)
  }
  assert.deepEqual(readVideo({ VIDEO_1: valid }, 'VIDEO_1')?.youtubeId, 'dQw4w9WgXcQ')
  assert.equal(readVideo({ VIDEO_1: valid }, 'VIDEO_2'), null)
})

test('isVideoReady and chapterStart', () => {
  const v = videoConfigSchema.parse(valid)
  assert.equal(isVideoReady(v), true)
  assert.equal(isVideoReady(null), false)
  assert.equal(isVideoReady({ ...v, chapters: [] }), false)
  assert.equal(chapterStart(v, 'integrity'), 120)
  assert.equal(chapterStart(v, 'missing'), null)
})

test('m:ss durations are converted', () => {
  assert.equal(parseDurationInput('6:30'), 390)
  assert.equal(parseDurationInput('0:45'), 45)
  assert.equal(parseDurationInput('1:02:03'), 3723)
  assert.equal(parseDurationInput('390'), 390)
  assert.equal(parseDurationInput(' 6:30 '), 390)
  for (const bad of ['', 'abc', '6:75', '6:', ':30', '-5', '1.5']) assert.equal(parseDurationInput(bad), null, bad)
})

interface Row { videos: unknown; updatedAt: Date }

/** A one-row in-memory stand-in for the config table; `touch` simulates someone else saving. */
function fakeDb(initial: Row | null) {
  const state = { row: initial }
  const db = {
    onboardingConfig: {
      findUnique: async () => state.row,
      create: async ({ data }: { data: { videos: unknown } }) => {
        if (state.row) throw new Error('unique')
        state.row = { videos: data.videos, updatedAt: new Date(1000) }
      },
      updateMany: async ({ where, data }: { where: { updatedAt: Date }; data: { videos: unknown } }) => {
        if (!state.row || state.row.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 }
        state.row = { videos: data.videos, updatedAt: new Date(state.row.updatedAt.getTime() + 1000) }
        return { count: 1 }
      },
    },
  }
  const touch = () => {
    if (state.row) state.row = { ...state.row, updatedAt: new Date(state.row.updatedAt.getTime() + 500) }
  }
  return { db: db as unknown as PrismaClient, state, touch }
}

test('saveVideo replaces only the named key and keeps the other as stored', async () => {
  const other = { ...valid, youtubeId: 'AAAAAAAAAAA' }
  const { db, state } = fakeDb({ videos: { VIDEO_1: other, VIDEO_2: 'junk' }, updatedAt: new Date(1000) })
  const view = await saveVideo(db, { key: 'VIDEO_1', video: valid, expectedUpdatedAt: new Date(1000).toISOString() })
  assert.equal(view.videos.VIDEO_1?.youtubeId, 'dQw4w9WgXcQ')
  assert.equal((state.row?.videos as Record<string, unknown>).VIDEO_2, 'junk')
  assert.deepEqual(view.unreadable, ['VIDEO_2'])
})

test('saveVideo with null removes just that key', async () => {
  const { db } = fakeDb({ videos: { VIDEO_1: valid, VIDEO_2: valid }, updatedAt: new Date(1000) })
  const view = await saveVideo(db, { key: 'VIDEO_2', video: null, expectedUpdatedAt: new Date(1000).toISOString() })
  assert.deepEqual(Object.keys(view.videos), ['VIDEO_1'])
})

test('saveVideo refuses a stale page with 409 and writes nothing', async () => {
  const { db, state, touch } = fakeDb({ videos: { VIDEO_1: valid }, updatedAt: new Date(1000) })
  const loadedAt = new Date(1000).toISOString()
  touch()
  const before = state.row
  await assert.rejects(
    saveVideo(db, { key: 'VIDEO_2', video: valid, expectedUpdatedAt: loadedAt }),
    (e: unknown) => e instanceof AcademyError && e.status === 409 && e.message === 'Someone else changed the videos. Reload to see their changes.',
  )
  assert.equal(state.row, before)
})

test('saveVideo creates the row when none exists and refuses a stale null', async () => {
  const empty = fakeDb(null)
  const view = await saveVideo(empty.db, { key: 'VIDEO_1', video: valid, expectedUpdatedAt: null })
  assert.ok(view.updatedAt)
  const created = fakeDb({ videos: {}, updatedAt: new Date(1000) })
  await assert.rejects(saveVideo(created.db, { key: 'VIDEO_1', video: valid, expectedUpdatedAt: null }), (e: unknown) => e instanceof AcademyError && e.status === 409)
})

test('saveVideo validates the video and the key', async () => {
  const { db } = fakeDb(null)
  await assert.rejects(saveVideo(db, { key: 'VIDEO_1', video: { ...valid, youtubeId: 'bad' }, expectedUpdatedAt: null }))
  await assert.rejects(saveVideo(db, { key: 'VIDEO_3', video: valid, expectedUpdatedAt: null }))
})

test('getVideoSettings reports unreadable videos and updatedAt', async () => {
  const { db } = fakeDb({ videos: { VIDEO_1: valid, VIDEO_2: { youtubeId: 'x' } }, updatedAt: new Date(1000) })
  const view = await getVideoSettings(db)
  assert.deepEqual(view.unreadable, ['VIDEO_2'])
  assert.equal(view.updatedAt, new Date(1000).toISOString())
  assert.deepEqual((await getVideoSettings(fakeDb(null).db)), { videos: {}, unreadable: [], updatedAt: null })
})

test('the admin nav links to the video settings', () => {
  const icon = (() => null) as unknown as SidebarConfig['items'][number]['icon']
  const config: SidebarConfig = {
    items: [{ label: 'Dashboard', href: '/admin', icon }],
    groups: [{ label: 'Onboarding', items: [] }],
  }
  const hrefs = withAcademyNav(config, true, { library: icon, contacts: icon, links: icon }).groups[0].items.map((i) => i.href)
  assert.ok(hrefs.includes('/admin/onboarding/academy/videos'))
})
