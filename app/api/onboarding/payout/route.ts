import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation, requireAcademySession } from '@/lib/academy/http'
import { notifyPaymentDetailsChanged } from '@/lib/academy/service/notify-oa'
import { savePayout } from '@/lib/academy/service/payout'

const NO_STORE = { 'Cache-Control': 'no-store' }

function failure(error: unknown): NextResponse {
  const response = academyErrorResponse(error)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAcademySession()
    await guardAcademyMutation(request, user.id)
    const body: unknown = await request.json()
    const { isUpdate } = await savePayout(prisma, user.id, body)
    if (isUpdate) await notifyPaymentDetailsChanged(user.id, user.name)
    // Writes never echo details back.
    return NextResponse.json({ success: true }, { headers: NO_STORE })
  } catch (error) {
    return failure(error)
  }
}
