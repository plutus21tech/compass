import test from 'node:test'
import assert from 'node:assert/strict'
import { chapterStart, isVideoReady, parseDurationInput, readVideo, videoConfigSchema, videoConfigsSchema } from '../lib/academy/video'
import { academyConfigInputSchema } from '../lib/academy/links'
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

test('the config input accepts videos', () => {
  assert.ok(academyConfigInputSchema.safeParse({ videos: { VIDEO_1: valid } }).success)
  assert.equal(academyConfigInputSchema.safeParse({ videos: { VIDEO_3: valid } }).success, false)
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
