import type { TransitionTask } from '@/lib/leave-transition-plan'

export type LeaveType = 'CASUAL' | 'SICK' | 'ANNUAL'
export type HalfDaySession = 'FIRST_HALF' | 'SECOND_HALF'

export const LEAVE_TYPES: readonly LeaveType[] = ['CASUAL', 'SICK', 'ANNUAL']

export interface LeaveBalance {
  casualDays: number
  sickDays: number
  annualDays: number
  casualUsed: number
  sickUsed: number
  annualUsed: number
  remaining: {
    casual: number
    sick: number
    annual: number
  }
}

export interface LeaveRequest {
  id: string
  leaveType: LeaveType
  isHalfDay: boolean
  halfDaySession?: HalfDaySession | null
  unavailableStartTime?: string | null
  unavailableEndTime?: string | null
  startDate: string
  endDate: string
  reason: string
  transitionPlan: string
  transitionPlanTasks?: TransitionTask[] | null
  transitionPlanSubmittedAt?: string | null
  transitionPlanLeadStatus?: 'PENDING' | 'APPROVED' | 'DISAPPROVED'
  transitionPlanDisapprovalReason?: string | null
  status: string
  // Holiday-aware day count from the API -- what the balance is charged.
  leaveDays?: number
  coverPerson?: { id: string; name: string }
  coverPeople?: Array<{ id: string; name: string }>
  additionalNotifyIds?: string[]
  leadApprovedBy?: string
  hrApprovedBy?: string
  rejectionReason?: string
  createdAt: string
}

export interface ApprovalRequest extends LeaveRequest {
  employee: {
    id: string
    name: string
    department: string | null
    position: string | null
  }
}

export interface CalendarEvent {
  id: string
  employeeId: string
  employeeName: string
  department: string | null
  leaveType: LeaveType
  isHalfDay: boolean
  halfDaySession?: HalfDaySession | null
  unavailableStartTime?: string | null
  unavailableEndTime?: string | null
  startDate: string
  endDate: string
  status: string
  isCurrentUser: boolean
}

export interface WfhRequest {
  id: string
  startDate: string
  endDate: string
  reason: string
  workPlan?: string | null
  status: string
  leadApprovedBy?: string | null
  hrApprovedBy?: string | null
  rejectionReason?: string | null
  createdAt: string
  employee?: {
    id: string
    name: string
    department: string | null
    position: string | null
  }
}

export interface DirectoryUser {
  id: string
  name: string
  department?: string | null
}

/** The stored calendar day: a leading YYYY-MM-DD wins, else the UTC day; '' when invalid. */
export const toDateKey = (value: string): string => {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (match) return match[1]

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`
}
