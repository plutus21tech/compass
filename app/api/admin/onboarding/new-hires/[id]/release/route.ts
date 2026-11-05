import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { academyErrorResponse, guardAcademyMutation } from '@/lib/academy/http'
import { releaseCourse } from '@/lib/academy/service/course'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademyHr()
    await guardAcademyMutation(request, user.id)
    const { id } = await context.params
    return NextResponse.json({ success: true, data: await releaseCourse(prisma, id, user.id) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
