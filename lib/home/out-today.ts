export const OUT_STATUSES = ['PENDING', 'LEAD_APPROVED', 'HR_APPROVED', 'APPROVED'] as const
export const PENDING_STATUSES = ['PENDING', 'LEAD_APPROVED', 'HR_APPROVED'] as const
/** Only fully approved leave makes someone "out today", on Home and on Time off alike. */
export const OUT_TODAY_STATUS = 'APPROVED'

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
}

export interface HolidayView {
  date: string
  name: string
  daysAway: number
}

export interface HomeOverview {
  today: string
  /** Everyone out, the viewer included: cards show it through `othersOutToday`. */
  outToday: OutTodayView
  department: string | null
  departmentOutToday: number | null
  nextOutInDepartment: { name: string; startDate: string } | null
  teamLabel: string | null
  nextHoliday: HolidayView | null
  upcomingHolidays: HolidayView[]
}

export interface OutTodayView {
  count: number
  people: OutPerson[]
}

/** Lower is better: a full day beats a half day. */
const rank = (row: OutRow): number => (row.isHalfDay ? 1 : 0)

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
    if (row.status !== OUT_TODAY_STATUS) continue
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
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))

  const viewerDepartment = normalise(viewer.department)
  const departmentOutToday =
    viewerDepartment === null
      ? null
      : people.filter((p) => p.id !== viewer.id && normalise(p.department) === viewerDepartment).length

  return { people, departmentOutToday }
}

/** The one "who is out today" both Home and Time off show: the viewer is never counted or listed. */
export function othersOutToday(outToday: OutTodayView, viewerId: string): OutTodayView {
  const people = outToday.people.filter((p) => p.id !== viewerId)
  return { count: people.length, people }
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
