import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { birthdaysInMonth, leaveHolidayAppliesTo } from '@/lib/leave-holidays'
import { isArchived } from '@/lib/teams/catalog'
import { loadTeamCatalog } from '@/lib/teams/load'
import { leaveDateKey } from '@/lib/leave-utils'

/**
 * The month's holidays, three ways:
 * - `holidays`: the viewer's own team's -- the only ones that affect their leave.
 * - `allHolidays`: every team's, with the teams observing each, for the calendar's team filter.
 * - `holidayTeams`: the teams that filter offers (current teams, plus any a holiday here still carries).
 */
async function loadMonthHolidays(teamTag: string | null, startOfMonth: Date, endOfMonth: Date) {
  const [rows, catalog] = await Promise.all([
    prisma.leaveHoliday.findMany({
      where: { date: { gte: startOfMonth, lte: endOfMonth } },
      select: { id: true, date: true, name: true, teamTags: true },
      orderBy: { date: 'asc' },
    }),
    loadTeamCatalog(),
  ])
  const allHolidays = rows.map((row) => ({
    id: row.id,
    date: leaveDateKey(row.date),
    name: row.name,
    teamTags: row.teamTags,
  }))
  const holidays = allHolidays
    .filter((holiday) => leaveHolidayAppliesTo(holiday, teamTag))
    .map(({ id, date, name }) => ({ id, date, name }))
  const used = new Set(allHolidays.flatMap((holiday) => holiday.teamTags))
  const holidayTeams = catalog.definitions
    .filter((definition) => !isArchived(definition) || used.has(definition.code))
    .map((definition) => ({ code: definition.code, label: definition.label }))
  return { holidays, allHolidays, holidayTeams }
}

/** Everyone's birthdays in the month: name and day only, never a year. */
async function loadMonthBirthdays(year: number, monthIndex: number) {
  const rows = await prisma.employeeBirthday.findMany({
    where: { month: monthIndex + 1 },
    select: { userId: true, month: true, day: true, user: { select: { name: true } } },
  })
  return birthdaysInMonth(
    rows.map((row) => ({ userId: row.userId, name: row.user.name, month: row.month, day: row.day })),
    year,
    monthIndex
  )
}

// GET - Get team leave calendar data
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const { searchParams } = new URL(request.url)
    const month = parseInt(searchParams.get('month') || String(new Date().getMonth()), 10)
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10)
    
    // Use UTC month bounds so "January 2026" is consistent regardless of server timezone.
    // This ensures backfilled and other leave stored in UTC display correctly.
    const startOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
    const endOfMonth = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
    
    // Get all approved/pending leave requests that overlap with this month
    const leaveRequests = await prisma.leaveRequest.findMany({
      where: {
        status: { in: ['APPROVED', 'PENDING', 'LEAD_APPROVED', 'HR_APPROVED'] },
        OR: [
          {
            startDate: { gte: startOfMonth, lte: endOfMonth },
          },
          {
            endDate: { gte: startOfMonth, lte: endOfMonth },
          },
          {
            AND: [
              { startDate: { lte: startOfMonth } },
              { endDate: { gte: endOfMonth } },
            ],
          },
        ],
      },
      include: {
        employee: {
          select: { id: true, name: true, department: true },
        },
      },
      orderBy: { startDate: 'asc' },
    })
    
    // Transform into calendar events
    const events = leaveRequests.map(request => ({
      id: request.id,
      employeeId: request.employeeId,
      employeeName: request.employee.name,
      department: request.employee.department,
      leaveType: request.leaveType,
      isHalfDay: request.isHalfDay,
      halfDaySession: request.halfDaySession,
      unavailableStartTime: request.unavailableStartTime,
      unavailableEndTime: request.unavailableEndTime,
      startDate: request.startDate.toISOString(),
      endDate: request.endDate.toISOString(),
      status: request.status,
      isCurrentUser: request.employeeId === user.id,
    }))

    const [monthHolidays, birthdays] = await Promise.all([
      loadMonthHolidays(user.teamTag, startOfMonth, endOfMonth),
      loadMonthBirthdays(year, month),
    ])

    return NextResponse.json({ events, ...monthHolidays, birthdays })
  } catch (error) {
    console.error('Failed to fetch calendar data:', error)
    return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 500 })
  }
}
