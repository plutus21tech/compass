import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/db'
import { ACTIVE_PERSON_WHERE } from '@/lib/people/directory'
import { loadTeamCatalog } from '@/lib/teams/load'
import { teamShortLabel } from '@/lib/teams/catalog'
import { addDays, daysBetween, dayKeyOf, karachiDayKey } from './time'
import {
  OUT_STATUSES,
  OUT_TODAY_STATUS,
  summariseOutToday,
  type HolidayView,
  type HomeOverview,
  type OutRow,
} from './out-today'

export const NEXT_OUT_WINDOW_DAYS = 60
export const HOLIDAY_LIST_MAX = 20
const HOLIDAY_WINDOW_DAYS = 365

const dayDate = (key: string): Date => new Date(`${key}T00:00:00Z`)

async function loadHolidays(
  db: PrismaClient,
  teamTag: string,
  today: string
): Promise<HolidayView[]> {
  const rows = await db.leaveHoliday.findMany({
    where: {
      teamTags: { has: teamTag },
      date: { gte: dayDate(today), lt: dayDate(addDays(today, HOLIDAY_WINDOW_DAYS)) },
    },
    orderBy: [{ date: 'asc' }, { name: 'asc' }],
    take: HOLIDAY_LIST_MAX,
    select: { date: true, name: true },
  })
  return rows.map((row) => {
    const date = dayKeyOf(row.date)
    return { date, name: row.name, daysAway: daysBetween(today, date) }
  })
}

export async function loadHomeOverview(
  viewer: { id: string; department: string | null; teamTag: string | null },
  now: Date,
  db: PrismaClient = prisma
): Promise<HomeOverview> {
  const today = karachiDayKey(now)
  const todayDate = dayDate(today)
  // "Next out" still looks ahead at requests waiting for approval; "out today" does not.
  const upcomingStatuses = [...OUT_STATUSES]
  const department = viewer.department?.trim() ? viewer.department : null

  const [outRows, nextOut, holidays, catalog] = await Promise.all([
    db.leaveRequest.findMany({
      where: {
        status: OUT_TODAY_STATUS,
        startDate: { lte: todayDate },
        endDate: { gte: todayDate },
        employee: ACTIVE_PERSON_WHERE,
      },
      select: {
        employeeId: true,
        leaveType: true,
        isHalfDay: true,
        halfDaySession: true,
        status: true,
        employee: { select: { name: true, department: true } },
      },
    }),
    department
      ? db.leaveRequest.findFirst({
          where: {
            status: { in: upcomingStatuses },
            employeeId: { not: viewer.id },
            employee: { AND: [ACTIVE_PERSON_WHERE, { department: { equals: department, mode: 'insensitive' } }] },
            startDate: { gt: todayDate, lte: dayDate(addDays(today, NEXT_OUT_WINDOW_DAYS)) },
          },
          orderBy: { startDate: 'asc' },
          select: { startDate: true, employee: { select: { name: true } } },
        })
      : Promise.resolve(null),
    viewer.teamTag ? loadHolidays(db, viewer.teamTag, today) : Promise.resolve([]),
    viewer.teamTag ? loadTeamCatalog() : Promise.resolve(null),
  ])

  const rows: OutRow[] = outRows.map((row) => ({
    employeeId: row.employeeId,
    name: row.employee.name,
    department: row.employee.department,
    leaveType: row.leaveType,
    isHalfDay: row.isHalfDay,
    halfDaySession: row.halfDaySession,
    status: row.status,
  }))
  const { people, departmentOutToday } = summariseOutToday(rows, viewer)

  return {
    today,
    outToday: { count: people.length, people },
    department,
    departmentOutToday,
    nextOutInDepartment: nextOut
      ? { name: nextOut.employee.name, startDate: dayKeyOf(nextOut.startDate) }
      : null,
    teamLabel: viewer.teamTag && catalog ? `${teamShortLabel(catalog, viewer.teamTag)} team` : null,
    nextHoliday: holidays[0] ?? null,
    upcomingHolidays: holidays,
  }
}
