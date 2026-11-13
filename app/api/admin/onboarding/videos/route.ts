import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation } from '@/lib/academy/http'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { getVideoSettings, saveVideo } from '@/lib/academy/service/videos'

// HR only. Saving one video never touches the other, or anyone's progress.
export async function GET() {
  try {
    await requireAcademyHr()
    return NextResponse.json({ success: true, data: await getVideoSettings(prisma) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}

/** Body: { key: 'VIDEO_1' | 'VIDEO_2', video: config | null, expectedVersion: the key's version from GET } */
export async function PUT(request: NextRequest) {
  try {
    const user = await requireAcademyHr()
    await guardAcademyMutation(request, user.id)
    const body: unknown = await request.json()
    return NextResponse.json({ success: true, data: await saveVideo(prisma, body) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
