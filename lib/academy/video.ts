// Pure video rules for the Academy. No server-only imports: safe for client components.
import { z } from 'zod'

export const VIDEO_KEYS = ['VIDEO_1', 'VIDEO_2'] as const
export type VideoKey = (typeof VIDEO_KEYS)[number]

export const MIN_VIDEO_SECONDS = 30
export const MAX_VIDEO_SECONDS = 7200
export const MAX_CHAPTERS = 30
export const MAX_TRANSCRIPT_CHARS = 100_000
export const VIDEO_LANGUAGES = ['en', 'fr', 'es'] as const
export type VideoLanguage = (typeof VIDEO_LANGUAGES)[number]

const chapterSchema = z.object({
  key: z.string().trim().min(1).max(60).regex(/^[a-z0-9-]+$/, 'use a-z, 0-9 and -'),
  label: z.string().trim().min(1).max(120),
  start: z.number().int().min(0),
})

const transcriptSchema = z.string().max(MAX_TRANSCRIPT_CHARS)

export const videoConfigSchema = z
  .object({
    youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/, 'a YouTube ID is 11 letters, numbers, - or _'),
    durationSeconds: z.number().int().min(MIN_VIDEO_SECONDS).max(MAX_VIDEO_SECONDS),
    chapters: z.array(chapterSchema).min(1).max(MAX_CHAPTERS),
    transcripts: z.object({ en: transcriptSchema.optional(), fr: transcriptSchema.optional(), es: transcriptSchema.optional() }),
  })
  .superRefine((video, ctx) => {
    const { chapters, durationSeconds } = video
    if (chapters[0] && chapters[0].start !== 0) {
      ctx.addIssue({ code: 'custom', path: ['chapters', 0, 'start'], message: 'the first chapter starts at 0' })
    }
    chapters.forEach((chapter, i) => {
      if (i > 0 && chapter.start <= chapters[i - 1].start) {
        ctx.addIssue({ code: 'custom', path: ['chapters', i, 'start'], message: 'chapter starts must be unique and ascending' })
      }
      if (chapter.start >= durationSeconds) {
        ctx.addIssue({ code: 'custom', path: ['chapters', i, 'start'], message: 'a chapter must start before the video ends' })
      }
      if (chapters.findIndex((c) => c.key === chapter.key) !== i) {
        ctx.addIssue({ code: 'custom', path: ['chapters', i, 'key'], message: 'chapter keys must be unique' })
      }
    })
  })

export type VideoConfig = z.infer<typeof videoConfigSchema>

export const videoConfigsSchema = z
  .object({ VIDEO_1: videoConfigSchema.optional(), VIDEO_2: videoConfigSchema.optional() })
  .strict()

export type VideoConfigs = z.infer<typeof videoConfigsSchema>

/** Stored JSON could be anything: a valid video or null. Never throws. */
export function readVideo(stored: unknown, key: VideoKey): VideoConfig | null {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return null
  const parsed = videoConfigSchema.safeParse((stored as Record<string, unknown>)[key])
  return parsed.success ? parsed.data : null
}

/** A video is ready with an ID, a duration and at least one chapter. */
export function isVideoReady(video: VideoConfig | null | undefined): video is VideoConfig {
  return video != null && video.youtubeId.length === 11 && video.durationSeconds > 0 && video.chapters.length > 0
}

export function chapterStart(video: VideoConfig, chapterKey: string): number | null {
  return video.chapters.find((c) => c.key === chapterKey)?.start ?? null
}

/** Accepts seconds ("390"), m:ss ("6:30") or h:mm:ss ("1:02:03"); null when it is none of these. */
export function parseDurationInput(input: string): number | null {
  const text = input.trim()
  if (/^\d+$/.test(text)) return Number(text)
  const match = /^(?:(\d+):)?(\d{1,3}):([0-5]\d)$/.exec(text)
  if (!match) return null
  const hasHours = match[1] !== undefined
  if (hasHours && (match[2].length > 2 || Number(match[2]) > 59)) return null
  return (hasHours ? Number(match[1]) * 3600 : 0) + Number(match[2]) * 60 + Number(match[3])
}

/** 390 reads as 6:30. */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** How far the player's real length may stray from HR's before the editor says so (R6). */
export const LENGTH_TOLERANCE_SECONDS = 2

/**
 * The editor's warning when YouTube's real length and the typed one differ by more than 2 seconds.
 * A wrong length strands hires on "Saving your progress". Null when they agree or either is unknown.
 */
export function lengthMismatch(realSeconds: number, typedSeconds: number | null): string | null {
  if (typedSeconds === null || !(realSeconds > 0)) return null
  const real = Math.round(realSeconds)
  if (Math.abs(realSeconds - typedSeconds) <= LENGTH_TOLERANCE_SECONDS) return null
  return `This video is ${formatDuration(real)} long, but the length here says ${formatDuration(typedSeconds)}.`
}

/** A transcript goes out as plain text that is never cached or sniffed as anything else. */
export const TRANSCRIPT_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const

/** An error about a transcript isn't cached either: access can change. */
export const TRANSCRIPT_ERROR_HEADERS = { 'Cache-Control': 'no-store' } as const
