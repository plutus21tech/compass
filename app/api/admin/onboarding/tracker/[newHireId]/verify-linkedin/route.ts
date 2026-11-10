import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { academyErrorResponse, guardAcademyMutation } from '@/lib/academy/http'
import { verifyLinkedin } from '@/lib/academy/service/tracker-actions'

interface RouteContext {
  params: Promise<{ newHireId: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademyHr()
    await guardAcademyMutation(request, user.id)
    const { newHireId } = await context.params
    await verifyLinkedin(prisma, newHireId, user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
