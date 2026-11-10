import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { AcademyError, academyErrorResponse, requireAcademySession } from '@/lib/academy/http'
import { loadPaymentTracker, loadTracker } from '@/lib/academy/service/tracker'
import { trackerFiltersSchema } from '@/lib/academy/tracker'

const NO_STORE = 'no-store'

/** HR gets the full list. OA gets payment columns only, and no filters. Everyone else gets a 403. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAcademySession()
    if (user.role === 'OA') {
      const data = await loadPaymentTracker(prisma, user)
      return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': NO_STORE } })
    }
    if (user.role !== 'HR') throw new AcademyError('Forbidden', 403)
    const filters = trackerFiltersSchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    const data = await loadTracker(prisma, user, filters)
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': NO_STORE } })
  } catch (error) {
    const response = academyErrorResponse(error)
    response.headers.set('Cache-Control', NO_STORE)
    return response
  }
}
