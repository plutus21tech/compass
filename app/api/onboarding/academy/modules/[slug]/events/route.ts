import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation, requireAcademySession } from '@/lib/academy/http'
import { progressEventSchema, type ProgressEvent } from '@/lib/academy/progress'
import { recordEvent } from '@/lib/academy/service/progress'

interface RouteContext {
  params: Promise<{ slug: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademySession()
    const { slug } = await context.params
    // Parsed first so the guard can pick the bucket; nothing is written before the guard passes.
    const event: ProgressEvent = progressEventSchema.parse(await request.json())
    await guardAcademyMutation(request, user.id, event.type === 'VIDEO_PROGRESS' ? 'video' : 'default')
    // The server's clock, never the client's, decides how far a video report may reach.
    return NextResponse.json({ success: true, data: await recordEvent(prisma, user.id, slug, event, new Date()) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
