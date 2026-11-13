import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse } from '@/lib/academy/http'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { loadMostMissed } from '@/lib/academy/service/most-missed'

const NO_STORE = 'no-store'

export async function GET() {
  try {
    const user = await requireAcademyHr()
    const data = await loadMostMissed(prisma, user)
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': NO_STORE } })
  } catch (error) {
    const response = academyErrorResponse(error)
    response.headers.set('Cache-Control', NO_STORE)
    return response
  }
}
