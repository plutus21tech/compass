import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, requireAcademySession } from '@/lib/academy/http'
import { loadLostEquipment } from '@/lib/academy/service/lost-equipment'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** The dashboard asks on every load. */
export async function GET() {
  try {
    await requireAcademySession()
    return NextResponse.json({ success: true, data: await loadLostEquipment(prisma) }, { headers: NO_STORE })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
