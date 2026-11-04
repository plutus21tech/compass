import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendPayoutUpdatedNotification } from '@/lib/email'
import { academyErrorResponse, guardAcademyMutation, requireAcademySession } from '@/lib/academy/http'
import { readOwnPayout, savePayout } from '@/lib/academy/service/payout'

const NO_STORE = { 'Cache-Control': 'no-store' }

function failure(error: unknown): NextResponse {
  const response = academyErrorResponse(error)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

/** Failures are logged with the user id only: OA must not silently miss a bank-detail change. */
async function notifyOa(userId: string, name: string): Promise<void> {
  try {
    const result = await sendPayoutUpdatedNotification(name)
    if (!result.success) console.error('[academy] payout update notification not delivered', { userId })
  } catch {
    console.error('[academy] payout update notification failed', { userId })
  }
}

export async function GET() {
  try {
    const user = await requireAcademySession()
    const data = await readOwnPayout(prisma, user.id)
    return NextResponse.json({ success: true, data }, { headers: NO_STORE })
  } catch (error) {
    return failure(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAcademySession()
    await guardAcademyMutation(request, user.id)
    const body: unknown = await request.json()
    const { isUpdate } = await savePayout(prisma, user.id, body)
    if (isUpdate) await notifyOa(user.id, user.name)
    // Writes never echo details back; the owner reads them through GET.
    return NextResponse.json({ success: true }, { headers: NO_STORE })
  } catch (error) {
    return failure(error)
  }
}
