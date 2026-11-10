import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation } from '@/lib/academy/http'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { getAcademyConfig, updateAcademyConfig } from '@/lib/academy/service/library'

export async function GET() {
  try {
    await requireAcademyHr()
    return NextResponse.json({ success: true, data: await getAcademyConfig(prisma) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAcademyHr()
    await guardAcademyMutation(request, user.id)
    const body: unknown = await request.json()
    return NextResponse.json({ success: true, data: await updateAcademyConfig(prisma, body) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
