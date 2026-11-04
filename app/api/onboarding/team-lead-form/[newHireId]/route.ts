import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageOnboarding } from '@/lib/permissions'
import { sendTeamLeadFormSubmittedNotification } from '@/lib/email'
import { isAcademyEnabled } from '@/lib/academy/flag'
import { formatZodIssues } from '@/lib/academy/profile-input'
import { leadInputDraftSchema, leadInputSchema, normalizeLeadInputBody, shouldApplyLeadInput } from '@/lib/academy/setup'

interface RouteContext {
  params: Promise<{ newHireId: string }>
}

function canAccessTeamLeadForm(args: { role: string; userId: string; teamLeadId: string | null }) {
  if (canManageOnboarding(args.role)) return true
  return args.teamLeadId === args.userId
}

function clearedLeadInput() {
  return {
    roleExpectations: null,
    day1Goal: null,
    week1Goal: null,
    month1Goal: null,
    month3Goal: null,
    tutorials: [],
    teamTools: [],
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { newHireId } = await context.params
    const record = await prisma.newHire.findUnique({
      where: { id: newHireId },
      include: {
        teamLead: { select: { id: true, name: true, email: true } },
        teamLeadForm: true,
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'New hire not found' }, { status: 404 })
    }
    if (!canAccessTeamLeadForm({ role: user.role, userId: user.id, teamLeadId: record.teamLeadId })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({
      newHire: {
        id: record.id,
        name: record.name,
        title: record.title,
        department: record.department,
        teamLead: record.teamLead,
      },
      form: record.teamLeadForm,
      academyEnabled: isAcademyEnabled(),
    })
  } catch (error) {
    console.error('Failed to fetch team lead form:', error)
    return NextResponse.json({ error: 'Failed to fetch team lead form' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { newHireId } = await context.params
    const record = await prisma.newHire.findUnique({
      where: { id: newHireId },
      include: { teamLeadForm: true },
    })
    if (!record || !record.teamLeadForm) {
      return NextResponse.json({ error: 'Team lead form not found' }, { status: 404 })
    }
    if (!canAccessTeamLeadForm({ role: user.role, userId: user.id, teamLeadId: record.teamLeadId })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const submit = body.submit === true

    let leadInputData: Record<string, unknown> = {}
    if (shouldApplyLeadInput(isAcademyEnabled())) {
      const incoming = normalizeLeadInputBody(body)
      const stored = normalizeLeadInputBody(record.teamLeadForm)
      const parsed = submit
        ? leadInputSchema.safeParse({ ...stored, ...incoming })
        : leadInputDraftSchema.safeParse(incoming)
      if (!parsed.success) {
        return NextResponse.json({ error: formatZodIssues(parsed.error) }, { status: 400 })
      }
      // A draft replaces what was sent; fields left blank are cleared.
      leadInputData = submit ? parsed.data : { ...clearedLeadInput(), ...parsed.data }
    }

    const updated = await prisma.teamLeadForm.update({
      where: { newHireId },
      data: {
        ...(typeof body.emailGroups === 'string' ? { emailGroups: body.emailGroups.trim() || null } : {}),
        ...(typeof body.discordChannels === 'string' ? { discordChannels: body.discordChannels.trim() || null } : {}),
        ...(typeof body.tools === 'string' ? { tools: body.tools.trim() || null } : {}),
        ...(typeof body.earlyKpis === 'string' ? { earlyKpis: body.earlyKpis.trim() || null } : {}),
        ...(typeof body.availableOnDate === 'string' ? { availableOnDate: body.availableOnDate.trim() || null } : {}),
        ...(typeof body.resources === 'string' ? { resources: body.resources.trim() || null } : {}),
        ...leadInputData,
        ...(submit ? { submittedAt: new Date() } : {}),
      },
    })

    if (submit) {
      try {
        await sendTeamLeadFormSubmittedNotification(newHireId)
      } catch (emailError) {
        console.error('Failed to send team lead form submitted notification:', emailError)
      }
    }

    return NextResponse.json({ success: true, form: updated })
  } catch (error) {
    console.error('Failed to update team lead form:', error)
    return NextResponse.json({ error: 'Failed to update team lead form' }, { status: 500 })
  }
}
