import { Palmtree, Sun, Thermometer, type LucideIcon } from 'lucide-react'
import { LEAVE_TYPE_LABEL, LEAVE_TYPE_TONE } from '@/lib/leave-type-style'
import type { LeaveType } from '@/lib/time-off/types'

interface LeaveTypeStyle {
  label: string
  icon: LucideIcon
  dot: string
  text: string
  bar: string
  bgLight: string
  chip: string
}

export const LEAVE_TYPE_STYLE: Record<LeaveType, LeaveTypeStyle> = {
  CASUAL: {
    ...LEAVE_TYPE_TONE.CASUAL,
    label: LEAVE_TYPE_LABEL.CASUAL,
    icon: Sun,
    bgLight: 'bg-amber-100 dark:bg-amber-500/20',
    chip: 'bg-amber-100 text-amber-900 border-l-2 border-amber-500 dark:bg-amber-500/15 dark:text-amber-100',
  },
  SICK: {
    ...LEAVE_TYPE_TONE.SICK,
    label: LEAVE_TYPE_LABEL.SICK,
    icon: Thermometer,
    bgLight: 'bg-red-100 dark:bg-red-500/20',
    chip: 'bg-red-100 text-red-900 border-l-2 border-red-500 dark:bg-red-500/15 dark:text-red-100',
  },
  ANNUAL: {
    ...LEAVE_TYPE_TONE.ANNUAL,
    label: LEAVE_TYPE_LABEL.ANNUAL,
    icon: Palmtree,
    bgLight: 'bg-emerald-100 dark:bg-emerald-500/20',
    chip: 'bg-emerald-100 text-emerald-900 border-l-2 border-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-100',
  },
}

export const STATUS_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  PENDING: { color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-500/20', label: 'Pending' },
  LEAD_APPROVED: { color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-500/20', label: 'Lead Approved' },
  HR_APPROVED: { color: 'text-indigo-600', bg: 'bg-indigo-100 dark:bg-indigo-500/20', label: 'HR Approved' },
  APPROVED: { color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-500/20', label: 'Approved' },
  REJECTED: { color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-500/20', label: 'Rejected' },
  CANCELLED: { color: 'text-gray-600', bg: 'bg-gray-100 dark:bg-gray-500/20', label: 'Cancelled' },
}

export const halfDaySessionLabel = (session?: 'FIRST_HALF' | 'SECOND_HALF' | null): string => {
  if (session === 'FIRST_HALF') return 'First half'
  if (session === 'SECOND_HALF') return 'Second half'
  return 'Half day'
}

export const halfDayWindowLabel = (start?: string | null, end?: string | null): string => {
  if (!start || !end) return 'Unavailable hours not provided'
  return `${start} - ${end}`
}
