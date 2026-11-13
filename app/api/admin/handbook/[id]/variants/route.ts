import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { teamLabel, unknownTeamTags } from '@/lib/handbook/teams'
import { loadTeamCatalog } from '@/lib/teams/load'
import { findOverlapForPage } from '@/lib/handbook/admin-queries'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: pageId } = await params
    const { bodyMarkdown, audiences } = (await request.json()) as {
      bodyMarkdown?: string
      audiences?: string[]
    }

    if (!audiences?.length) {
      return NextResponse.json({ error: 'Select at least one team' }, { status: 400 })
    }
    const teams = await loadTeamCatalog()
    const invalid = unknownTeamTags(teams, audiences)
    if (invalid.length) {
      return NextResponse.json({ error: `Invalid team(s): ${invalid.join(', ')}` }, { status: 400 })
    }

    // Two variants of one page must never claim the same team -- that reader
    // would see two conflicting policies with no way to tell which is theirs.
    const overlap = await findOverlapForPage(pageId, { audiences })
    if (overlap.length) {
      const names = overlap.map((t) => teamLabel(teams, t)).join(', ')
      return NextResponse.json(
        { error: `Another variant of this page already covers: ${names}` },
        { status: 400 }
      )
    }

    const count = await prisma.handbookVariant.count({ where: { pageId } })
    const variant = await prisma.handbookVariant.create({
      data: {
        pageId,
        bodyMarkdown: bodyMarkdown ?? '',
        orderIndex: count,
        audiences: { create: audiences.map((team) => ({ team })) },
      },
      include: { audiences: { select: { team: true } } },
    })

    return NextResponse.json({ variant })
  } catch (error) {
    console.error('Failed to create handbook variant:', error)
    return NextResponse.json({ error: 'Failed to create variant' }, { status: 500 })
  }
}
