// Pure tracker types and role shaping. No server-only imports: safe for client components.
import type { AcknowledgementKind, NewHireStatus, OnboardingPaymentMethod } from '@prisma/client'
import { z } from 'zod'
import type { ChecklistItemView } from './checklist'
import { AcademyError } from './errors'
import type { CardStatus } from './progress'

const blankToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value)
const filterText = z.preprocess(blankToUndefined, z.string().trim().max(200).optional())

export const trackerFiltersSchema = z.object({
  location: filterText,
  department: filterText,
  status: z.preprocess(blankToUndefined, z.enum(['PENDING', 'ONBOARDING', 'COMPLETED']).optional()),
})

export type TrackerFilters = z.output<typeof trackerFiltersSchema>

/** `userId` is the key to the masked payment API, which is by user. */
export interface TrackerPaymentStatus {
  userId: string | null
  saved: boolean
  method: OnboardingPaymentMethod | null
  lastChangedAt: string | null
}

/** JSON-safe: dates are ISO strings. */
export interface TrackerRow {
  newHireId: string
  name: string
  title: string
  department: string | null
  location: string | null
  joiningDate: string
  status: NewHireStatus
  modulesDone: number
  /** Zero until the course is released. */
  modulesTotal: number
  overdueCount: number
  quizScore: string | null
  checklistDone: number
  checklistTotal: number
  finishedAt: string | null
  paymentStatus: TrackerPaymentStatus
}

/** All OA ever gets of a hire. */
export type OaTrackerRow = Pick<TrackerRow, 'newHireId' | 'name' | 'department' | 'joiningDate' | 'paymentStatus'>

export function shapeForRole(row: TrackerRow, role: 'HR'): TrackerRow
export function shapeForRole(row: TrackerRow, role: 'OA'): OaTrackerRow
export function shapeForRole(row: TrackerRow, role: string): TrackerRow | OaTrackerRow
export function shapeForRole(row: TrackerRow, role: string): TrackerRow | OaTrackerRow {
  if (role === 'HR') return row
  if (role !== 'OA') throw new AcademyError('Forbidden', 403)
  const { newHireId, name, department, joiningDate, paymentStatus } = row
  return { newHireId, name, department, joiningDate, paymentStatus }
}

export function quizScoreLabel(attempt: { score: number; totalQuestions: number } | null | undefined): string | null {
  return attempt ? `${attempt.score} of ${attempt.totalQuestions}` : null
}

export interface DrawerModule {
  moduleId: string
  slug: string
  title: string
  number: number
  status: CardStatus
  overdue: boolean
  /** The version the hire saw or will see. */
  version: number | null
  startedAt: string | null
  dueAt: string | null
  completedAt: string | null
  unlockedEarly: boolean
  unlockable: boolean
}

export interface DrawerWrongQuestion {
  questionId: string
  question: string
  chosen: string
  correctAnswer: string
}

export interface DrawerQuizAttempt {
  id: string
  score: number
  total: number
  passed: boolean
  takenAt: string
  wrongQuestions: DrawerWrongQuestion[]
}

export interface DrawerAcknowledgement {
  id: string
  kind: AcknowledgementKind
  typedName: string
  signedAt: string
}

export interface DrawerLinkedin {
  url: string | null
  /** True only while the link on file is the one HR verified. */
  verified: boolean
  verifiedAt: string | null
}

/** Masked values only. `unreadable` means a stored value could not be opened, so `fields` is empty. */
export interface DrawerPayment {
  method: OnboardingPaymentMethod
  accountHolderName: string | null
  currency: string | null
  fields: Record<string, string | null>
  lastChangedAt: string
  unreadable: boolean
}

/** HR only. JSON-safe: dates are ISO strings. */
export interface TrackerDrawer {
  newHireId: string
  userId: string | null
  name: string
  title: string
  department: string | null
  location: string | null
  joiningDate: string
  status: NewHireStatus
  releasedAt: string | null
  finishedAt: string | null
  modules: DrawerModule[]
  quizAttempts: DrawerQuizAttempt[]
  acknowledgements: DrawerAcknowledgement[]
  checklist: ChecklistItemView[]
  linkedin: DrawerLinkedin
  payment: DrawerPayment | null
}
