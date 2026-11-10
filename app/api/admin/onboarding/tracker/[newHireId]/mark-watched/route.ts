import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { academyErrorResponse, guardAcademyMutation, readBoundedJson } from '@/lib/academy/http'
import { markWatched, markWatchedBodySchema } from '@/lib/academy/service/mark-watched'

/** A module id and a reason of at most 500 characters fit well inside this. */
const MARK_WATCHED_BODY_MAX_CHARS = 2_000

interface RouteContext {
  params: Promise<{ newHireId: string }>
}

/** HR only: completes a stuck hire's video module, with the reason kept on the row. */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademyHr()
    await guardAcademyMutation(request, user.id)
    const { newHireId } = await context.params
    const { moduleId, reason } = markWatchedBodySchema.parse(await readBoundedJson(request, MARK_WATCHED_BODY_MAX_CHARS))
    await markWatched(prisma, user, newHireId, moduleId, reason)
    return NextResponse.json({ success: true })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
