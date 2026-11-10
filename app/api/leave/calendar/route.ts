import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { birthdaysInMonth } from '@/lib/leave-holidays'
import { leaveDateKey } from '@/lib/leave-utils'

/** Holidays in the month that apply to the viewer's own team -- the ones that affect their leave. */
async function loadViewerHolidays(teamTag: string | null, startOfMonth: Date, endOfMonth: Date) {
  if (!teamTag) return []
  // Same rule as leaveHolidayAppliesTo: the holiday lists the viewer's team.
  const holidays = await prisma.leaveHoliday.findMany({
    where: { date: { gte: startOfMonth, lte: endOfMonth }, teamTags: { has: teamTag } },
    select: { id: true, date: true, name: true },
    orderBy: { date: 'asc' },
  })
  return holidays.map((holiday) => ({ id: holiday.id, date: leaveDateKey(holiday.date), name: holiday.name }))
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

    const [holidays, birthdays] = await Promise.all([
      loadViewerHolidays(user.teamTag, startOfMonth, endOfMonth),
      loadMonthBirthdays(year, month),
    ])

    return NextResponse.json({ events, holidays, birthdays })
  } catch (error) {
    console.error('Failed to fetch calendar data:', error)
    return NextResponse.json({ error: 'Failed to fetch calendar' }, { status: 500 })
  }
}
