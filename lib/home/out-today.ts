export const OUT_STATUSES = ['PENDING', 'LEAD_APPROVED', 'HR_APPROVED', 'APPROVED'] as const
export const PENDING_STATUSES = ['PENDING', 'LEAD_APPROVED', 'HR_APPROVED'] as const

export type LeaveTypeValue = 'CASUAL' | 'SICK' | 'ANNUAL'

export interface OutRow {
  employeeId: string
  name: string
  department: string | null
  leaveType: LeaveTypeValue
  isHalfDay: boolean
  halfDaySession: string | null
  status: string
}

export interface OutPerson {
  id: string
  name: string
  department: string | null
  leaveType: LeaveTypeValue
  isHalfDay: boolean
  halfDaySession: string | null
  pending: boolean
}

export interface HolidayView {
  date: string
  name: string
  daysAway: number
}

export interface HomeOverview {
  today: string
  outToday: { count: number; people: OutPerson[] }
  department: string | null
  departmentOutToday: number | null
  nextOutInDepartment: { name: string; startDate: string } | null
  teamLabel: string | null
  nextHoliday: HolidayView | null
  upcomingHolidays: HolidayView[]
}

const isPending = (status: string): boolean => (PENDING_STATUSES as readonly string[]).includes(status)

/** Lower is better: a final row beats a pending one, then a full day beats a half day. */
const rank = (row: OutRow): number => (isPending(row.status) ? 2 : 0) + (row.isHalfDay ? 1 : 0)

const normalise = (value: string | null): string | null => {
  const trimmed = value?.trim().toLowerCase()
  return trimmed ? trimmed : null
}

export function summariseOutToday(
  rows: readonly OutRow[],
  viewer: { id: string; department: string | null }
): { people: OutPerson[]; departmentOutToday: number | null } {
  const best = new Map<string, OutRow>()
  for (const row of rows) {
    const current = best.get(row.employeeId)
    if (!current || rank(row) < rank(current)) best.set(row.employeeId, row)
  }

  const people: OutPerson[] = [...best.values()]
    .map((row) => ({
      id: row.employeeId,
      name: row.name,
      department: row.department,
      leaveType: row.leaveType,
      isHalfDay: row.isHalfDay,
      halfDaySession: row.halfDaySession,
      pending: isPending(row.status),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))

  const viewerDepartment = normalise(viewer.department)
  const departmentOutToday =
    viewerDepartment === null
      ? null
      : people.filter((p) => p.id !== viewer.id && normalise(p.department) === viewerDepartment).length

  return { people, departmentOutToday }
}

/** One row of GET /api/leave/requests?scope=team-upcoming, as Home reads it. */
export interface TeamUpcomingRow {
  id: string
  leaveType: LeaveTypeValue
  status: string
  startDate: string
  endDate: string
  employee: { id: string; name: string; department: string | null }
}
