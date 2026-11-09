import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation } from '@/lib/academy/http'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { getAcademyConfig, updateAcademyConfig } from '@/lib/academy/service/library'

// HR only. Saving the videos never touches anyone's progress.
export async function GET() {
  try {
    await requireAcademyHr()
    const { videos } = await getAcademyConfig(prisma)
    return NextResponse.json({ success: true, data: videos })
  } catch (error) {
    return academyErrorResponse(error)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAcademyHr()
    await guardAcademyMutation(request, user.id)
    const body: unknown = await request.json()
    const { videos } = await updateAcademyConfig(prisma, { videos: body })
    return NextResponse.json({ success: true, data: videos })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
