// Pure rules: no server-only imports. Safe for client components.
import type { OnboardingModuleStatus } from '@prisma/client'
import { z } from 'zod'
import { MAX_VIDEO_SECONDS } from './video'

// A type, not an interface, so it stays assignable to Prisma's JSON input.
export type VideoProgress = {
  /** The furthest second the server accepts as watched. */
  furthest: number
  /**
   * The watch clock: the last report's time, moved later by any tolerance already spent,
   * so the tolerance can't be spent twice. It may sit up to 15 / 1.1 seconds ahead of the report.
   */
  reportedAt: string
  /** The duration from HR's config when this was counted. A different one restarts the count. */
  durationSeconds: number
}

export interface ProgressState {
  checks: Record<string, boolean>
  linksOpenedAt: Record<string, string>
  scrolledToEnd: boolean
  linkedinUrl?: string
  video?: VideoProgress
}

const videoProgressSchema = z.object({
  furthest: z.number().finite().min(0),
  reportedAt: z.string().datetime(),
  durationSeconds: z.number().int().positive(),
})

const progressSchema = z.object({
  checks: z.record(z.string(), z.boolean()),
  linksOpenedAt: z.record(z.string(), z.string()),
  scrolledToEnd: z.boolean(),
  linkedinUrl: z.string().optional(),
  // A broken video count is dropped on its own, so it can't wipe the ticks beside it.
  video: videoProgressSchema.optional().catch(undefined),
})

const emptyState = (): ProgressState => ({ checks: {}, linksOpenedAt: {}, scrolledToEnd: false })

/** Stored state could be anything: bad JSON gives the empty state and never throws. */
export function parseProgressState(json: unknown): ProgressState {
  const parsed = progressSchema.safeParse(json)
  if (!parsed.success) return emptyState()
  const { video, ...rest } = parsed.data
  return video ? { ...rest, video } : rest
}

export type ProgressEvent =
  | { type: 'CHECK'; key: string; checked: boolean }
  | { type: 'LINK_OPENED'; key: string }
  | { type: 'SCROLLED_END' }
  | { type: 'VIDEO_PROGRESS'; seconds: number }

const eventKey = z.string().min(1).max(200)

/** What a client may report. Whether a key belongs to the module is checked by the service. */
export const progressEventSchema: z.ZodType<ProgressEvent> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CHECK'), key: eventKey, checked: z.boolean() }).strict(),
  z.object({ type: z.literal('LINK_OPENED'), key: eventKey }).strict(),
  z.object({ type: z.literal('SCROLLED_END') }).strict(),
  z.object({ type: z.literal('VIDEO_PROGRESS'), seconds: z.number().finite().min(0).max(MAX_VIDEO_SECONDS) }).strict(),
])

/** Real time may run this much faster than the clock, for buffering and network delay. */
export const VIDEO_SPEED_ALLOWANCE = 1.1
/** Seconds a report may run ahead of the time passed. Spent once, and refilled only by watching. */
export const VIDEO_TOLERANCE_SECONDS = 15
export const VIDEO_COMPLETE_SHARE = 0.95
/** The most real time one report can count, so a gap (a tab left open, a late first report) isn't watching. */
export const VIDEO_MAX_ELAPSED_SECONDS = 30

const secondsBetween = (from: Date, to: Date): number => (to.getTime() - from.getTime()) / 1000

/**
 * The server's count of how far someone has watched. The new furthest is
 * min(seconds, previous + elapsed x 1.1 + 15, duration), and it never drops. Elapsed is capped at 30
 * seconds per report, so a long gap counts as 30 seconds of watching. A count made against
 * another duration restarts from 0 with no elapsed time. With no count yet, elapsed runs from the
 * row's start, or is 0 when there is none.
 */
export function applyVideoProgress(
  state: ProgressState,
  seconds: number,
  now: Date,
  durationSeconds: number,
  startedAt: Date | null = null,
): ProgressState {
  const stored = state.video
  const sameVideo = stored !== undefined && stored.durationSeconds === durationSeconds
  const previous = sameVideo ? stored.furthest : 0
  const clock = sameVideo ? new Date(stored.reportedAt) : stored === undefined && startedAt ? startedAt : now
  // A clock moved ahead by spent tolerance makes elapsed negative: the spent part comes back off.
  const elapsed = Math.min(secondsBetween(clock, now), VIDEO_MAX_ELAPSED_SECONDS)
  const budget = previous + elapsed * VIDEO_SPEED_ALLOWANCE + VIDEO_TOLERANCE_SECONDS
  const furthest = Math.max(previous, Math.min(seconds, budget, durationSeconds))
  // What is left of the budget carries over as tolerance, never above the full 15.
  const tolerance = Math.min(VIDEO_TOLERANCE_SECONDS, Math.max(0, budget - furthest))
  // Rounded up to the millisecond the stored ISO string holds, so rounding never favours the client.
  const spentMs = Math.ceil(((VIDEO_TOLERANCE_SECONDS - tolerance) / VIDEO_SPEED_ALLOWANCE) * 1000)
  const reportedAt = new Date(now.getTime() + spentMs)
  return { ...state, video: { furthest, reportedAt: reportedAt.toISOString(), durationSeconds } }
}

/** The furthest point counted against this duration; a count against another one is 0. */
export function videoFurthest(state: ProgressState, durationSeconds: number | null | undefined): number {
  return state.video && state.video.durationSeconds === durationSeconds ? state.video.furthest : 0
}

/** VIDEO_95: the furthest point reaches 95% of HR's duration. */
export function videoWatched(state: ProgressState, durationSeconds: number | null | undefined): boolean {
  return durationSeconds != null && videoFurthest(state, durationSeconds) >= VIDEO_COMPLETE_SHARE * durationSeconds
}

export function applyEvent(state: ProgressState, event: ProgressEvent, now: Date): ProgressState {
  switch (event.type) {
    case 'CHECK':
      return { ...state, checks: { ...state.checks, [event.key]: event.checked } }
    case 'LINK_OPENED':
      return {
        ...state,
        linksOpenedAt: { [event.key]: now.toISOString(), ...state.linksOpenedAt },
      }
    case 'SCROLLED_END':
      return { ...state, scrolledToEnd: true }
    case 'VIDEO_PROGRESS':
      // Needs HR's duration and the row's start, so the service calls applyVideoProgress instead.
      return state
  }
}

export type CardStatus = 'LOCKED' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED'

export interface ModuleCardRow {
  status: OnboardingModuleStatus
  startedAt: Date | null
  dueAt: Date | null
  unlockedEarlyById?: string | null
}

function cardStatus(row: ModuleCardRow): CardStatus {
  if (row.status === 'LOCKED' && row.unlockedEarlyById) return 'AVAILABLE'
  return row.status === 'IN_PROGRESS' && row.startedAt === null ? 'AVAILABLE' : row.status
}

/** AVAILABLE is the DB's IN_PROGRESS before the hire has opened it, or a row HR has unlocked early. */
export function moduleCardState(row: ModuleCardRow, now: Date): { status: CardStatus; overdue: boolean } {
  const status = cardStatus(row)
  const overdue = status !== 'COMPLETED' && row.dueAt !== null && now.getTime() > row.dueAt.getTime()
  return { status, overdue }
}

export interface UnlockCandidate {
  id: string
  orderIndex: number
  isActive: boolean
}

/** The active module right after the completed one, by orderIndex, or null. */
export function nextToUnlock(modules: readonly UnlockCandidate[], completedModuleId: string): string | null {
  const done = modules.find((m) => m.id === completedModuleId)
  if (!done) return null
  const later = modules.filter((m) => m.isActive && m.orderIndex > done.orderIndex)
  const next = later.reduce<UnlockCandidate | null>((best, m) => (!best || m.orderIndex < best.orderIndex ? m : best), null)
  return next?.id ?? null
}
