import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { AcademyError } from '@/lib/academy/errors'
import { academyErrorResponse, guardAcademyMutation, requireAcademySession } from '@/lib/academy/http'
import { canReadPayoutDetails } from '@/lib/academy/payout'
import { readPayout } from '@/lib/academy/service/payout'

interface RouteContext {
  params: Promise<{ userId: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademySession()
    if (!canReadPayoutDetails(user.role)) throw new AcademyError('Forbidden', 403)
    await guardAcademyMutation(request, user.id)
    const { userId } = await context.params
    const data = await readPayout(prisma, userId, { reveal: true, viewerId: user.id })
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const response = academyErrorResponse(error)
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}
