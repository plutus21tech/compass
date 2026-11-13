import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { AcademyError } from '@/lib/academy/errors'
import { academyErrorResponse, requireAcademySession } from '@/lib/academy/http'
import { listMyChecklist } from '@/lib/academy/service/tracker-actions'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** Open to any signed-in person: the service returns only the items they may tick. */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAcademySession()
    const newHireId = request.nextUrl.searchParams.get('newHireId')
    if (!newHireId) throw new AcademyError('Choose a new hire.', 400)
    return NextResponse.json({ success: true, data: await listMyChecklist(prisma, user, newHireId) }, { headers: NO_STORE })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
