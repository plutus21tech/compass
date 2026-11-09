// Pure rules for the Academy video player. No server-only imports: safe for client components.
import type { VideoConfig } from './video'

type Chapter = VideoConfig['chapters'][number]

/** A first viewing may seek this far past the furthest point watched. */
export const SEEK_TOLERANCE_SECONDS = 2
/** A resumed first viewing starts this far before the furthest point, so the hire picks up the thread. */
export const RESUME_LEAD_SECONDS = 2
export const ARROW_STEP_SECONDS = 5
export const PAGE_STEP_SECONDS = 30

const finiteOrZero = (value: number) => (Number.isFinite(value) ? value : 0)

/** Rewinding is always fine. On a first viewing a seek past furthest + 2s snaps back to furthest. */
export function snapSeek(target: number, furthest: number, completed: boolean): number {
  const wanted = Math.max(0, finiteOrZero(target))
  if (completed) return wanted
  return wanted > furthest + SEEK_TOLERANCE_SECONDS ? Math.max(0, furthest) : wanted
}

/** "6:30", or "1:02:05" from an hour. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(finiteOrZero(seconds)))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`
}

/** The chapter playing at `seconds`. Chapters are ascending and the first starts at 0. */
export function chapterAt(chapters: readonly Chapter[], seconds: number): Chapter | null {
  if (chapters.length === 0) return null
  return chapters.reduce((current, chapter) => (chapter.start <= seconds ? chapter : current), chapters[0])
}

export interface ChapterTick { key: string; label: string; percent: number }

/** One tick per chapter boundary on the scrubber: the first chapter's start is the track's own start. */
export function tickPositions(chapters: readonly Chapter[], duration: number): ChapterTick[] {
  if (!(duration > 0)) return []
  return chapters
    .filter((chapter) => chapter.start > 0 && chapter.start < duration)
    .map((chapter) => ({ key: chapter.key, label: chapter.label, percent: (chapter.start / duration) * 100 }))
}

/** Playback can run a little fast between polls (rate rounding, a late timer); a jump is anything beyond this. */
const PLAYBACK_SLACK = 1.25

export interface PlaybackSample {
  furthest: number
  /** The position at the last poll. */
  previous: number
  position: number
  /** Real time since the last poll. Timers slow down in a background tab, so this can be long. */
  elapsedSeconds: number
  free: boolean
}

/**
 * Continuous playback moves furthest on; a rewind or a jump doesn't. On a first viewing, a jump past
 * furthest + 2s (from anywhere but our own seek) is snapped back. Playing from a point ahead of
 * furthest (a seek inside the tolerance) moves it on by the time played only, so repeated clicks
 * just ahead can't ratchet it forward.
 */
export function followPlayback({ furthest, previous, position, elapsedSeconds, free }: PlaybackSample): { furthest: number; snapBack: boolean } {
  const natural = position >= previous && position <= previous + Math.max(0, elapsedSeconds) * PLAYBACK_SLACK + SEEK_TOLERANCE_SECONDS
  if (natural) {
    const next = previous > furthest ? furthest + (position - previous) : Math.max(furthest, position)
    return { furthest: next, snapBack: false }
  }
  return { furthest, snapBack: !free && position > furthest + SEEK_TOLERANCE_SECONDS }
}

/**
 * Where playback really starts when YouTube says it is playing. A jump made while paused (YouTube's
 * own keys or overlay) is caught here on a first viewing and sent back to furthest.
 */
export function playingFrom(current: number, furthest: number, free: boolean): { position: number; snapBack: boolean } {
  if (!free && current > furthest + SEEK_TOLERANCE_SECONDS) return { position: Math.max(0, furthest), snapBack: true }
  return { position: current, snapBack: false }
}

/** The report interval the session uses while playing. */
export const REPORT_EVERY_MS = 10_000
const MAX_REPORT_BACKOFF_MS = 60_000

/** How long to hold reports after this many failures in a row: none, then doubling, at most a minute. */
export function reportBackoffMs(failures: number): number {
  if (failures <= 0) return 0
  return Math.min(MAX_REPORT_BACKOFF_MS, REPORT_EVERY_MS * 2 ** (failures - 1))
}

/** The tab hiding, the page closing and leaving the page can all fire: one report per point is enough. */
export function dedupeHideReport(lastSent: number | null, furthest: number): boolean {
  return lastSent !== furthest
}

export interface StartInput {
  chapters: readonly Chapter[]
  /** From `?chapter=key`. */
  chapterKey: string | null
  furthest: number
  completed: boolean
  duration: number
}

/** A deep-linked chapter, never past furthest on a first viewing; otherwise resume, or the top once finished. */
export function startPosition({ chapters, chapterKey, furthest, completed, duration }: StartInput): number {
  const linked = chapterKey ? chapters.find((chapter) => chapter.key === chapterKey) : undefined
  if (linked) return completed ? linked.start : Math.min(linked.start, Math.max(0, furthest))
  if (completed || furthest >= duration) return 0
  return Math.max(0, furthest - RESUME_LEAD_SECONDS)
}

/** Where a scrubber key asks to go, before snapSeek. Null for any other key. */
export function stepSeek(key: string, position: number, duration: number): number | null {
  const clamp = (value: number) => Math.min(duration, Math.max(0, value))
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return clamp(position + ARROW_STEP_SECONDS)
    case 'ArrowLeft':
    case 'ArrowDown':
      return clamp(position - ARROW_STEP_SECONDS)
    case 'PageUp':
      return clamp(position + PAGE_STEP_SECONDS)
    case 'PageDown':
      return clamp(position - PAGE_STEP_SECONDS)
    case 'Home':
      return 0
    case 'End':
      return duration
    default:
      return null
  }
}

/** What a screen reader hears on the scrubber. */
export function scrubberValueText(position: number, duration: number, chapters: readonly Chapter[]): string {
  const chapter = chapterAt(chapters, position)
  const time = `${formatClock(position)} of ${formatClock(duration)}`
  return chapter ? `${time}, ${chapter.label}` : time
}

/** The end screen's one button. */
export function endScreenLabel(nextNumber: number | null, homeLabel: string): string {
  return nextNumber === null ? homeLabel : `Next: Module ${nextNumber}`
}
