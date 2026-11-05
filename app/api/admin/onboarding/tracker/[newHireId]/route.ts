import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { academyErrorResponse } from '@/lib/academy/http'
import { loadDrawer } from '@/lib/academy/service/tracker'

const NO_STORE = 'no-store'

interface RouteContext {
  params: Promise<{ newHireId: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademyHr()
    const { newHireId } = await context.params
    const data = await loadDrawer(prisma, user, newHireId)
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': NO_STORE } })
  } catch (error) {
    const response = academyErrorResponse(error)
    response.headers.set('Cache-Control', NO_STORE)
    return response
  }
}
