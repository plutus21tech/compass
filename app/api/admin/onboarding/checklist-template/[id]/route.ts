import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation } from '@/lib/academy/http'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { updateTemplateItem } from '@/lib/academy/service/checklist-template'

interface RouteContext {
  params: Promise<{ id: string }>
}

/** There is no DELETE: switch an item off with isActive instead. */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademyHr()
    await guardAcademyMutation(request, user.id)
    const { id } = await context.params
    const body: unknown = await request.json()
    return NextResponse.json({ success: true, data: await updateTemplateItem(prisma, id, body) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
