import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { firstIssueMessage, leaveHolidayInputSchema, resolveLeaveHolidayTeams } from '@/lib/leave-holiday-input'
import { loadTeamCatalog } from '@/lib/teams/load'
import { changeHolidayAndRecharge } from '@/lib/leave-holiday-store'

type RouteContext = { params: Promise<{ id: string }> }

const NOT_FOUND = { error: 'Holiday not found. It may have been removed already.' }

// PUT - edit a holiday's date, name or teams
export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const parsed = leaveHolidayInputSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 })
    }

    const existing = await prisma.leaveHoliday.findUnique({ where: { id } })
    if (!existing) return NextResponse.json(NOT_FOUND, { status: 404 })

    // An archived team the holiday already carries may stay; it cannot be newly added.
    const teams = resolveLeaveHolidayTeams(await loadTeamCatalog(), parsed.data.teamTags, existing.teamTags)
    if (!teams.ok) {
      return NextResponse.json({ error: teams.error }, { status: 400 })
    }

    const { date, name } = parsed.data
    const teamTags = teams.teamTags
    // Both versions are in scope: leave on the old date may now be charged, leave on
    // the new date may now be refunded, and the same for teams added or removed.
    const scope = { dates: [existing.date, date], teamTags: [...existing.teamTags, ...teamTags] }
    const { result: holiday, recharges } = await prisma.$transaction((tx) =>
      changeHolidayAndRecharge(tx, scope, () =>
        tx.leaveHoliday.update({ where: { id }, data: { date, name, teamTags } })
      )
    )

    return NextResponse.json({ success: true, holiday, adjustedBalances: recharges.length })
  } catch (error) {
    console.error('Failed to update leave holiday:', error)
    return NextResponse.json({ error: 'Failed to update holiday' }, { status: 500 })
  }
}

// DELETE - remove a holiday; leave over it is charged for that day again
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const existing = await prisma.leaveHoliday.findUnique({ where: { id } })
    if (!existing) return NextResponse.json(NOT_FOUND, { status: 404 })

    const { recharges } = await prisma.$transaction((tx) =>
      changeHolidayAndRecharge(tx, { dates: [existing.date], teamTags: existing.teamTags }, () =>
        tx.leaveHoliday.delete({ where: { id } })
      )
    )

    return NextResponse.json({ success: true, adjustedBalances: recharges.length })
  } catch (error) {
    console.error('Failed to delete leave holiday:', error)
    return NextResponse.json({ error: 'Failed to delete holiday' }, { status: 500 })
  }
}
