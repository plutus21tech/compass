import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { firstIssueMessage, leaveHolidayInputSchema, resolveLeaveHolidayTeams } from '@/lib/leave-holiday-input'
import { loadTeamCatalog } from '@/lib/teams/load'
import { changeHolidayAndRecharge } from '@/lib/leave-holiday-store'

/**
 * HR's list of leave-calendar holidays. Separate from payroll's public holidays.
 * Every write also moves already-charged leave balances (see changeHolidayAndRecharge).
 */

// GET - every leave holiday, for the HR admin list
export async function GET() {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const holidays = await prisma.leaveHoliday.findMany({ orderBy: [{ date: 'asc' }, { name: 'asc' }] })
    return NextResponse.json({ holidays })
  } catch (error) {
    console.error('Failed to fetch leave holidays:', error)
    return NextResponse.json({ error: 'Failed to load holidays' }, { status: 500 })
  }
}

// POST - add a holiday
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = leaveHolidayInputSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
    }

    const teams = resolveLeaveHolidayTeams(await loadTeamCatalog(), parsed.data.teamTags)
    if (!teams.ok) {
      return NextResponse.json({ error: teams.error }, { status: 400 })
    }

    const { date, name } = parsed.data
    const teamTags = teams.teamTags
    const { result: holiday, recharges } = await prisma.$transaction((tx) =>
      changeHolidayAndRecharge(tx, { dates: [date], teamTags }, () =>
        tx.leaveHoliday.create({ data: { date, name, teamTags } })
      )
    )

    return NextResponse.json({ success: true, holiday, adjustedBalances: recharges.length })
  } catch (error) {
    console.error('Failed to create leave holiday:', error)
    return NextResponse.json({ error: 'Failed to add holiday' }, { status: 500 })
  }
}
