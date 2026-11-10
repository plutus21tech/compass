import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, requireAcademySession } from '@/lib/academy/http'
import { loadAssigned } from '@/lib/academy/service/assignment'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** The dashboard asks on every load. */
export async function GET() {
  try {
    const user = await requireAcademySession()
    return NextResponse.json({ success: true, data: await loadAssigned(prisma, user.id) }, { headers: NO_STORE })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
