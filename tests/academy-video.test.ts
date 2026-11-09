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

/** A one-row in-memory stand-in for the config table; `touch` is someone saving another setting. */
function fakeDb(initial: Row | null, createError: Error = Object.assign(new Error('unique'), { code: 'P2002' })) {
  const state = { row: initial }
  const db = {
    onboardingConfig: {
      findUnique: async () => state.row,
      create: async ({ data }: { data: { videos: unknown } }) => {
        if (state.row) throw createError
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

const versionOf = async (db: PrismaClient, key: 'VIDEO_1' | 'VIDEO_2') => (await getVideoSettings(db)).versions[key]
const CONFLICT = (e: unknown) =>
  e instanceof AcademyError && e.status === 409 && e.message === 'Someone else changed this video. Reload to see their changes.'

test('saveVideo replaces only the named key and keeps the other as stored', async () => {
  const other = { ...valid, youtubeId: 'AAAAAAAAAAA' }
  const { db, state } = fakeDb({ videos: { VIDEO_1: other, VIDEO_2: 'junk' }, updatedAt: new Date(1000) })
  const view = await saveVideo(db, { key: 'VIDEO_1', video: valid, expectedVersion: await versionOf(db, 'VIDEO_1') })
  assert.equal(view.videos.VIDEO_1?.youtubeId, 'dQw4w9WgXcQ')
  assert.equal((state.row?.videos as Record<string, unknown>).VIDEO_2, 'junk')
  assert.deepEqual(view.unreadable, ['VIDEO_2'])
})

test('saveVideo with null removes just that key', async () => {
  const { db } = fakeDb({ videos: { VIDEO_1: valid, VIDEO_2: valid }, updatedAt: new Date(1000) })
  const view = await saveVideo(db, { key: 'VIDEO_2', video: null, expectedVersion: await versionOf(db, 'VIDEO_2') })
  assert.deepEqual(Object.keys(view.videos), ['VIDEO_1'])
})

test('saveVideo refuses a page whose video changed since it loaded, and writes nothing', async () => {
  const { db, state } = fakeDb({ videos: { VIDEO_1: valid }, updatedAt: new Date(1000) })
  const loaded = await versionOf(db, 'VIDEO_1')
  await saveVideo(db, { key: 'VIDEO_1', video: { ...valid, durationSeconds: 400 }, expectedVersion: loaded })
  const before = state.row
  await assert.rejects(saveVideo(db, { key: 'VIDEO_1', video: valid, expectedVersion: loaded }), CONFLICT)
  assert.equal(state.row, before)
})

test('another setting saved meanwhile, or the other video, does not refuse this save', async () => {
  const { db, state, touch } = fakeDb({ videos: { VIDEO_1: valid }, updatedAt: new Date(1000) })
  const loaded2 = await versionOf(db, 'VIDEO_2')
  touch()
  await saveVideo(db, { key: 'VIDEO_1', video: { ...valid, durationSeconds: 400 }, expectedVersion: await versionOf(db, 'VIDEO_1') })
  const view = await saveVideo(db, { key: 'VIDEO_2', video: valid, expectedVersion: loaded2 })
  assert.equal(view.videos.VIDEO_2?.youtubeId, valid.youtubeId)
  assert.equal((state.row?.videos as Record<string, { durationSeconds: number }>).VIDEO_1.durationSeconds, 400)
})

test('saveVideo creates the row when none exists; a row made meanwhile is written to, not refused', async () => {
  const empty = fakeDb(null)
  const none = await versionOf(empty.db, 'VIDEO_1')
  const view = await saveVideo(empty.db, { key: 'VIDEO_1', video: valid, expectedVersion: none })
  assert.ok(view.updatedAt)
  // Another setting created the row first: VIDEO_2 is still as the page saw it, so the save goes through.
  const raced = fakeDb(null)
  const loaded = await versionOf(raced.db, 'VIDEO_2')
  raced.state.row = { videos: {}, updatedAt: new Date(1000) }
  const after = await saveVideo(raced.db, { key: 'VIDEO_2', video: valid, expectedVersion: loaded })
  assert.equal(after.videos.VIDEO_2?.youtubeId, valid.youtubeId)
})

test('a create failure other than a unique clash is not reported as a conflict', async () => {
  const broken = fakeDb(null, new Error('connection lost'))
  const none = await versionOf(broken.db, 'VIDEO_1')
  // The row appears between the read and the create, and the create fails for another reason.
  const config = (broken.db as unknown as { onboardingConfig: { findUnique: () => Promise<Row | null> } }).onboardingConfig
  let reads = 0
  config.findUnique = async () => {
    reads += 1
    if (reads === 1) {
      broken.state.row = { videos: {}, updatedAt: new Date(1) }
      return null
    }
    return broken.state.row
  }
  await assert.rejects(saveVideo(broken.db, { key: 'VIDEO_1', video: valid, expectedVersion: none }), /connection lost/)
})

test('saveVideo validates the video and the key', async () => {
  const { db } = fakeDb(null)
  const none = await versionOf(db, 'VIDEO_1')
  await assert.rejects(saveVideo(db, { key: 'VIDEO_1', video: { ...valid, youtubeId: 'bad' }, expectedVersion: none }))
  await assert.rejects(saveVideo(db, { key: 'VIDEO_3', video: valid, expectedVersion: none }))
})

test('getVideoSettings reports unreadable videos, updatedAt and a version per key', async () => {
  const { db } = fakeDb({ videos: { VIDEO_1: valid, VIDEO_2: { youtubeId: 'x' } }, updatedAt: new Date(1000) })
  const view = await getVideoSettings(db)
  assert.deepEqual(view.unreadable, ['VIDEO_2'])
  assert.equal(view.updatedAt, new Date(1000).toISOString())
  assert.notEqual(view.versions.VIDEO_1, view.versions.VIDEO_2)
  const empty = await getVideoSettings(fakeDb(null).db)
  assert.deepEqual([empty.videos, empty.unreadable, empty.updatedAt], [{}, [], null])
  assert.equal(empty.versions.VIDEO_1, empty.versions.VIDEO_2)
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

test('the Videos nav item has its own icon', () => {
  const icon = (() => null) as unknown as SidebarConfig['items'][number]['icon']
  const videos = (() => null) as unknown as SidebarConfig['items'][number]['icon']
  const config: SidebarConfig = { items: [{ label: 'Dashboard', href: '/admin', icon }], groups: [{ label: 'Onboarding', items: [] }] }
  const items = withAcademyNav(config, true, { library: icon, contacts: icon, links: icon, videos }).groups[0].items
  assert.equal(items.find((i) => i.href === '/admin/onboarding/academy/videos')?.icon, videos)
})

test('lengthMismatch warns only past 2 seconds, in m:ss, and never for an unreadable length', async () => {
  const { lengthMismatch } = await import('../lib/academy/video')
  assert.equal(lengthMismatch(390, 390), null)
  assert.equal(lengthMismatch(392, 390), null)
  assert.equal(lengthMismatch(388.4, 390), null)
  assert.equal(lengthMismatch(393, 390), 'This video is 6:33 long, but the length here says 6:30.')
  assert.equal(lengthMismatch(370.6, 390), 'This video is 6:11 long, but the length here says 6:30.')
  assert.equal(lengthMismatch(390, null), null)
  assert.equal(lengthMismatch(0, 390), null)
})
