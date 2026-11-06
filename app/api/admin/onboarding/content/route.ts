import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { academyErrorResponse } from '@/lib/academy/http'
import { listContentModules } from '@/lib/academy/service/content'

export async function GET() {
  try {
    await requireAcademyHr()
    return NextResponse.json({ success: true, data: await listContentModules(prisma) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
