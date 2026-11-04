import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPayoutUpdatedNotification } from '@/lib/email'
import { academyErrorResponse, guardAcademyMutation, requireAcademySession } from '@/lib/academy/http'
import { readOwnPayout, savePayout } from '@/lib/academy/service/payout'

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function GET() {
  try {
    const user = await requireAcademySession()
    const data = await readOwnPayout(prisma, user.id)
    return NextResponse.json({ success: true, data }, { headers: NO_STORE })
  } catch (error) {
    const response = academyErrorResponse(error)
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAcademySession()
    await guardAcademyMutation(request, user.id)
    const body: unknown = await request.json()
    const { isUpdate } = await savePayout(prisma, user.id, body)
    if (isUpdate) {
      try {
        await sendPayoutUpdatedNotification(user.name)
      } catch {
        console.error('[academy] payout update notification failed', { userId: user.id })
      }
    }
    const data = await readOwnPayout(prisma, user.id)
    return NextResponse.json({ success: true, data }, { headers: NO_STORE })
  } catch (error) {
    const response = academyErrorResponse(error)
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}
