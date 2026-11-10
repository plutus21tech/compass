import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isAcademyEnabled } from '@/lib/academy/flag'
import { academyErrorResponse, requireAcademySession } from '@/lib/academy/http'
import { loadLostEquipment } from '@/lib/academy/service/lost-equipment'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** The dashboard asks on every load, so the flag being off is "nothing to show", not an error. */
export async function GET() {
  try {
    if (!isAcademyEnabled()) return NextResponse.json({ success: true, data: null }, { headers: NO_STORE })
    await requireAcademySession()
    return NextResponse.json({ success: true, data: await loadLostEquipment(prisma) }, { headers: NO_STORE })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
