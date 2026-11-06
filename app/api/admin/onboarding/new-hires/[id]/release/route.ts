import { after, NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { academyErrorResponse, guardAcademyMutation } from '@/lib/academy/http'
import { releaseCourse } from '@/lib/academy/service/course'
import { notifyCourseReleased } from '@/lib/academy/service/notify'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademyHr()
    await guardAcademyMutation(request, user.id)
    const { id } = await context.params
    const data = await releaseCourse(prisma, id, user.id)
    after(() => notifyCourseReleased(prisma, id))
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
