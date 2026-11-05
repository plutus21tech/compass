import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation, requireAcademySession } from '@/lib/academy/http'
import { progressEventSchema } from '@/lib/academy/progress'
import { recordEvent } from '@/lib/academy/service/progress'

interface RouteContext {
  params: Promise<{ slug: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademySession()
    await guardAcademyMutation(request, user.id)
    const { slug } = await context.params
    const event = progressEventSchema.parse(await request.json())
    return NextResponse.json({ success: true, data: await recordEvent(prisma, user.id, slug, event) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
