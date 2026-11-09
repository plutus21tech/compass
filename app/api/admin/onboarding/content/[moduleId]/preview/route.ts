import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { academyErrorResponse, guardAcademyMutation } from '@/lib/academy/http'
import { previewModule } from '@/lib/academy/service/preview'

export const runtime = 'nodejs'

const NO_STORE = 'no-store'

interface RouteContext {
  params: Promise<{ moduleId: string }>
}

/**
 * HR's "Preview as". A POST because it carries the chosen facts, but it writes nothing.
 * Body: `{ source: 'draft' | 'live', facts? }`, checked strictly in previewModule.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademyHr()
    await guardAcademyMutation(request, user.id, 'preview')
    const { moduleId } = await context.params
    const data = await previewModule(prisma, user, moduleId, await request.json())
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': NO_STORE } })
  } catch (error) {
    const response = academyErrorResponse(error)
    response.headers.set('Cache-Control', NO_STORE)
    return response
  }
}
