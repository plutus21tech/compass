import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation, requireAcademySession } from '@/lib/academy/http'
import { completeModule } from '@/lib/academy/service/progress'

interface RouteContext {
  params: Promise<{ slug: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademySession()
    await guardAcademyMutation(request, user.id)
    const { slug } = await context.params
    return NextResponse.json({ success: true, data: await completeModule(prisma, user.id, slug) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
