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
}

/** AVAILABLE is the DB's IN_PROGRESS before the hire has opened it. */
export function moduleCardState(row: ModuleCardRow, now: Date): { status: CardStatus; overdue: boolean } {
  const status: CardStatus =
    row.status === 'IN_PROGRESS' && row.startedAt === null ? 'AVAILABLE' : row.status
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
