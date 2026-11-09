import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SEEK_TOLERANCE_SECONDS,
  chapterAt,
  endScreenLabel,
  followPlayback,
  formatClock,
  scrubberValueText,
  snapSeek,
  startPosition,
  stepSeek,
  tickPositions,
} from '../lib/academy/video-player'

const CHAPTERS = [
  { key: 'welcome', label: 'Welcome', start: 0 },
  { key: 'our-story', label: 'Our story', start: 60 },
  { key: 'partners', label: 'Meet the partners', start: 240 },
]

// snapSeek

test('snapSeek lets a first viewing rewind freely', () => {
  assert.equal(snapSeek(10, 120, false), 10)
  assert.equal(snapSeek(0, 120, false), 0)
})

test('snapSeek allows up to furthest plus the tolerance on a first viewing', () => {
  assert.equal(SEEK_TOLERANCE_SECONDS, 2)
  assert.equal(snapSeek(121.5, 120, false), 121.5)
  assert.equal(snapSeek(122, 120, false), 122)
})

test('snapSeek snaps a seek past furthest plus 2 seconds back to furthest', () => {
  assert.equal(snapSeek(122.1, 120, false), 120)
  assert.equal(snapSeek(400, 120, false), 120)
})

test('snapSeek is free after completion', () => {
  assert.equal(snapSeek(400, 120, true), 400)
})

test('snapSeek never goes below zero and treats a broken target as zero', () => {
  assert.equal(snapSeek(-5, 120, false), 0)
  assert.equal(snapSeek(-5, 120, true), 0)
  assert.equal(snapSeek(Number.NaN, 120, false), 0)
})

// formatClock

test('formatClock prints m:ss under an hour', () => {
  assert.equal(formatClock(0), '0:00')
  assert.equal(formatClock(5), '0:05')
  assert.equal(formatClock(65), '1:05')
  assert.equal(formatClock(390), '6:30')
  assert.equal(formatClock(3599), '59:59')
})

test('formatClock prints h:mm:ss from an hour', () => {
  assert.equal(formatClock(3600), '1:00:00')
  assert.equal(formatClock(3725), '1:02:05')
})

test('formatClock floors fractions and clamps broken values to 0:00', () => {
  assert.equal(formatClock(65.9), '1:05')
  assert.equal(formatClock(-3), '0:00')
  assert.equal(formatClock(Number.NaN), '0:00')
  assert.equal(formatClock(Number.POSITIVE_INFINITY), '0:00')
})

// chapterAt

test('chapterAt finds the chapter a second falls in', () => {
  assert.equal(chapterAt(CHAPTERS, 0)?.key, 'welcome')
  assert.equal(chapterAt(CHAPTERS, 59.9)?.key, 'welcome')
  assert.equal(chapterAt(CHAPTERS, 60)?.key, 'our-story')
  assert.equal(chapterAt(CHAPTERS, 500)?.key, 'partners')
})

test('chapterAt gives the first chapter before the start and null with no chapters', () => {
  assert.equal(chapterAt(CHAPTERS, -1)?.key, 'welcome')
  assert.equal(chapterAt([], 30), null)
})

// tickPositions

test('tickPositions places a tick per chapter after the first, as a percentage', () => {
  assert.deepEqual(tickPositions(CHAPTERS, 480), [
    { key: 'our-story', label: 'Our story', percent: 12.5 },
    { key: 'partners', label: 'Meet the partners', percent: 50 },
  ])
})

test('tickPositions drops chapters at or past the end, and has none with no duration', () => {
  assert.deepEqual(tickPositions(CHAPTERS, 240), [{ key: 'our-story', label: 'Our story', percent: 25 }])
  assert.deepEqual(tickPositions(CHAPTERS, 0), [])
  assert.deepEqual(tickPositions([], 480), [])
})

// followPlayback

test('followPlayback moves furthest on with continuous playback', () => {
  assert.deepEqual(followPlayback({ furthest: 100, previous: 100, position: 100.3, elapsedSeconds: 0.25, free: false }), { furthest: 100.3, snapBack: false })
})

test('followPlayback keeps up when timers were slowed in a background tab', () => {
  assert.deepEqual(followPlayback({ furthest: 100, previous: 100, position: 160, elapsedSeconds: 60, free: false }), { furthest: 160, snapBack: false })
})

test('followPlayback lets a rewatch catch up with furthest and carry on', () => {
  assert.deepEqual(followPlayback({ furthest: 100, previous: 99.8, position: 100.1, elapsedSeconds: 0.25, free: false }), { furthest: 100.1, snapBack: false })
  assert.deepEqual(followPlayback({ furthest: 100, previous: 40, position: 40.25, elapsedSeconds: 0.25, free: false }), { furthest: 100, snapBack: false })
})

test('followPlayback ignores rewinds', () => {
  assert.deepEqual(followPlayback({ furthest: 100, previous: 90, position: 20, elapsedSeconds: 0.25, free: false }), { furthest: 100, snapBack: false })
})

test('followPlayback snaps back a jump past furthest on a first viewing, and allows it once free', () => {
  assert.deepEqual(followPlayback({ furthest: 100, previous: 100, position: 300, elapsedSeconds: 0.25, free: false }), { furthest: 100, snapBack: true })
  assert.deepEqual(followPlayback({ furthest: 100, previous: 50, position: 101.5, elapsedSeconds: 0.25, free: false }), { furthest: 100, snapBack: false })
  assert.deepEqual(followPlayback({ furthest: 100, previous: 100, position: 300, elapsedSeconds: 0.25, free: true }), { furthest: 100, snapBack: false })
})

// startPosition

test('startPosition resumes a first viewing a little before furthest', () => {
  assert.equal(startPosition({ chapters: CHAPTERS, chapterKey: null, furthest: 130, completed: false, duration: 480 }), 128)
  assert.equal(startPosition({ chapters: CHAPTERS, chapterKey: null, furthest: 1, completed: false, duration: 480 }), 0)
})

test('startPosition starts a finished video from the beginning', () => {
  assert.equal(startPosition({ chapters: CHAPTERS, chapterKey: null, furthest: 480, completed: true, duration: 480 }), 0)
})

test('startPosition opens a deep-linked chapter, never past furthest on a first viewing', () => {
  assert.equal(startPosition({ chapters: CHAPTERS, chapterKey: 'our-story', furthest: 300, completed: false, duration: 480 }), 60)
  assert.equal(startPosition({ chapters: CHAPTERS, chapterKey: 'partners', furthest: 100, completed: false, duration: 480 }), 100)
  assert.equal(startPosition({ chapters: CHAPTERS, chapterKey: 'partners', furthest: 0, completed: true, duration: 480 }), 240)
})

test('startPosition ignores an unknown chapter key', () => {
  assert.equal(startPosition({ chapters: CHAPTERS, chapterKey: 'nope', furthest: 130, completed: false, duration: 480 }), 128)
})

// stepSeek (keyboard)

test('stepSeek moves by the arrow step and jumps with Home and End', () => {
  assert.equal(stepSeek('ArrowRight', 60, 480), 65)
  assert.equal(stepSeek('ArrowUp', 60, 480), 65)
  assert.equal(stepSeek('ArrowLeft', 60, 480), 55)
  assert.equal(stepSeek('ArrowDown', 2, 480), 0)
  assert.equal(stepSeek('ArrowRight', 478, 480), 480)
  assert.equal(stepSeek('Home', 200, 480), 0)
  assert.equal(stepSeek('End', 200, 480), 480)
  assert.equal(stepSeek('PageUp', 60, 480), 90)
  assert.equal(stepSeek('PageDown', 60, 480), 30)
  assert.equal(stepSeek('a', 60, 480), null)
})

// labels

test('scrubberValueText reads the time and the chapter', () => {
  assert.equal(scrubberValueText(65, 480, CHAPTERS), '1:05 of 8:00, Our story')
  assert.equal(scrubberValueText(5, 480, []), '0:05 of 8:00')
})

test('endScreenLabel names the next module, or goes home', () => {
  assert.equal(endScreenLabel(2, 'Back to Home'), 'Next: Module 2')
  assert.equal(endScreenLabel(null, 'Back to Home'), 'Back to Home')
})
