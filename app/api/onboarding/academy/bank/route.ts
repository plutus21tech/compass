import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation, requireAcademySession } from '@/lib/academy/http'
import { readOwnBankStatus, saveBankDetails } from '@/lib/academy/service/fields'

const NO_STORE = { 'Cache-Control': 'no-store' }

function failure(error: unknown): NextResponse {
  const response = academyErrorResponse(error)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

/** Only { saved, ibanMasked }: the hire never reads their bank values back. */
export async function GET() {
  try {
    const user = await requireAcademySession()
    return NextResponse.json({ success: true, data: await readOwnBankStatus(prisma, user.id) }, { headers: NO_STORE })
  } catch (error) {
    return failure(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAcademySession()
    await guardAcademyMutation(request, user.id)
    await saveBankDetails(prisma, user.id, await request.json())
    // Writes never echo details back.
    return NextResponse.json({ success: true }, { headers: NO_STORE })
  } catch (error) {
    return failure(error)
  }
}
