// Pure wording for the HR tracker and the OA payment list. No server-only imports: safe for client components.
import type { NewHireStatus, OnboardingPaymentMethod } from '@prisma/client'
import type { ChecklistItemView, ItemState } from './checklist'
import type { CardStatus } from './progress'
import { FINISHED_WINDOW_DAYS } from './tracker'

export type ChipTone = 'neutral' | 'success' | 'warning' | 'danger'
export interface Chip { label: string; tone: ChipTone }

export const NO_CHECKLIST = 'No checklist yet'
export const OVERDUE_COLUMN = 'Overdue modules'

export const trackerIntro = (days: number = FINISHED_WINDOW_DAYS): string =>
  `Everyone currently onboarding, and anyone who finished in the last ${days} days.`

/** "3 of 14". With nothing to count, `empty` stands in. */
export function progressText(done: number, total: number, empty = 'Not released'): string {
  return total === 0 ? empty : `${done} of ${total}`
}

const CHECKLIST_CHIPS: Record<ItemState, Chip> = {
  OPEN: { label: 'Open', tone: 'neutral' },
  OVERDUE: { label: 'Overdue', tone: 'danger' },
  DONE: { label: 'Done', tone: 'success' },
  DONE_LATE: { label: 'Done late', tone: 'warning' },
  DONE_LATE_NEEDS_REASON: { label: 'Closed late, reason needed', tone: 'danger' },
}

export function checklistChip(state: ItemState): Chip {
  return CHECKLIST_CHIPS[state]
}

/** Ticking a late item, or closing one that was closed late with no reason, asks for a reason. */
export function checklistNeedsReason(item: Pick<ChecklistItemView, 'state'>): boolean {
  return item.state === 'OVERDUE' || item.state === 'DONE_LATE_NEEDS_REASON'
}

const MODULE_CHIPS: Record<CardStatus, Chip> = {
  LOCKED: { label: 'Locked', tone: 'neutral' },
  AVAILABLE: { label: 'Available', tone: 'neutral' },
  IN_PROGRESS: { label: 'In progress', tone: 'warning' },
  COMPLETED: { label: 'Completed', tone: 'success' },
}

export function moduleChip(status: CardStatus): Chip {
  return MODULE_CHIPS[status]
}

const HIRE_STATUS: Record<NewHireStatus, string> = {
  PENDING: 'Pending',
  ONBOARDING: 'Onboarding',
  COMPLETED: 'Completed',
}

export const HIRE_STATUS_OPTIONS = (Object.keys(HIRE_STATUS) as NewHireStatus[]).map((value) => ({ value, label: HIRE_STATUS[value] }))

export function hireStatusLabel(status: NewHireStatus): string {
  return HIRE_STATUS[status]
}

const METHOD_LABELS: Record<OnboardingPaymentMethod, string> = {
  WISE: 'Wise',
  PAYONEER: 'Payoneer',
  BANK_TRANSFER: 'Bank transfer',
  PK_BANK: 'Pakistan bank account',
  OTHER: 'Other',
}

export function paymentMethodLabel(method: OnboardingPaymentMethod): string {
  return METHOD_LABELS[method]
}

export function paymentChip(status: { saved: boolean }): Chip {
  return status.saved ? { label: 'Saved', tone: 'success' } : { label: 'Not added', tone: 'neutral' }
}

const FIELD_LABELS: Record<string, string> = {
  accountTitle: 'Account title',
  payoutEmail: 'Email',
  bankName: 'Bank name',
  branch: 'Branch',
  iban: 'IBAN',
  accountNumberOrIban: 'Account number or IBAN',
  swiftBic: 'SWIFT/BIC',
  bankAddress: 'Bank address',
  bankCountry: 'Bank country',
  instructions: 'Instructions',
}

export function paymentFieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, (c) => c.toUpperCase())
}

export function trackerEmptyMessage(filtered: boolean): string {
  return filtered ? 'No one matches these filters.' : 'No one is onboarding right now.'
}
