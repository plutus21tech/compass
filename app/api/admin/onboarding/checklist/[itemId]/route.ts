import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation, requireAcademySession } from '@/lib/academy/http'
import { tickBodySchema, tickChecklistItem } from '@/lib/academy/service/tracker-actions'

interface RouteContext {
  params: Promise<{ itemId: string }>
}

/** Open to any signed-in person: the service checks they may tick this item. */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademySession()
    await guardAcademyMutation(request, user.id)
    const { itemId } = await context.params
    const input = tickBodySchema.parse(await request.json())
    return NextResponse.json({ success: true, data: await tickChecklistItem(prisma, user, itemId, input) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
