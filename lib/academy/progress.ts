// Pure rules: no server-only imports. Safe for client components.
import type { OnboardingModuleStatus } from '@prisma/client'
import { z } from 'zod'

export interface ProgressState {
  checks: Record<string, boolean>
  linksOpenedAt: Record<string, string>
  scrolledToEnd: boolean
  linkedinUrl?: string
}

const progressSchema = z.object({
  checks: z.record(z.string(), z.boolean()),
  linksOpenedAt: z.record(z.string(), z.string()),
  scrolledToEnd: z.boolean(),
  linkedinUrl: z.string().optional(),
})

const emptyState = (): ProgressState => ({ checks: {}, linksOpenedAt: {}, scrolledToEnd: false })

/** Stored state could be anything: bad JSON gives the empty state and never throws. */
export function parseProgressState(json: unknown): ProgressState {
  const parsed = progressSchema.safeParse(json)
  return parsed.success ? parsed.data : emptyState()
}

export type ProgressEvent =
  | { type: 'CHECK'; key: string; checked: boolean }
  | { type: 'LINK_OPENED'; key: string }
  | { type: 'SCROLLED_END' }

const eventKey = z.string().min(1).max(200)

/** What a client may report. Whether a key belongs to the module is checked by the service. */
export const progressEventSchema: z.ZodType<ProgressEvent> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('CHECK'), key: eventKey, checked: z.boolean() }).strict(),
  z.object({ type: z.literal('LINK_OPENED'), key: eventKey }).strict(),
  z.object({ type: z.literal('SCROLLED_END') }).strict(),
])

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
