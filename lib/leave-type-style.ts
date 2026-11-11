import type { LeaveTypeValue } from '@/lib/home/out-today'

export const LEAVE_TYPE_ORDER = ['CASUAL', 'ANNUAL', 'SICK'] as const

export const LEAVE_TYPE_LABEL: Record<LeaveTypeValue, string> = {
  CASUAL: 'Casual',
  SICK: 'Sick',
  ANNUAL: 'Annual',
}

/** The colours /leave uses for each type. */
export const LEAVE_TYPE_TONE: Record<LeaveTypeValue, { bar: string; dot: string; text: string }> = {
  CASUAL: { bar: 'bg-amber-500', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  ANNUAL: { bar: 'bg-emerald-500', dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  SICK: { bar: 'bg-red-500', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
}
