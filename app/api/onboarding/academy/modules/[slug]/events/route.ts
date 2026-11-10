import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation, requireAcademySession } from '@/lib/academy/http'
import { progressEventSchema, type ProgressEvent } from '@/lib/academy/progress'
import { eventBucket } from '@/lib/academy/rate-limits'
import { recordEvent } from '@/lib/academy/service/progress'
import { assertSameOrigin } from '@/lib/security/same-origin'

interface RouteContext {
  params: Promise<{ slug: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademySession()
    const { slug } = await context.params
    // The origin is checked before the body is read; the guard checks it again with the rate limit.
    assertSameOrigin(request.headers, request.url)
    const body: unknown = await request.json().catch(() => undefined)
    // The bucket comes from the raw body, so a bad body still counts against a limit before it is refused.
    await guardAcademyMutation(request, user.id, eventBucket(body))
    if (body === undefined) throw new SyntaxError('Invalid JSON')
    const event: ProgressEvent = progressEventSchema.parse(body)
    // The server's clock, never the client's, decides how far a video report may reach.
    return NextResponse.json({ success: true, data: await recordEvent(prisma, user.id, slug, event, new Date()) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
