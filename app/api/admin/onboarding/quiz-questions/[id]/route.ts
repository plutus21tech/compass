import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageOnboarding } from '@/lib/permissions'
import { AcademyError } from '@/lib/academy/errors'
import { academyErrorResponse, guardAcademyMutation } from '@/lib/academy/http'
import { reactivateQuestion, retireQuestion, updateQuestion } from '@/lib/academy/service/quiz-editor'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const body = await request.json()

    // { isActive } alone brings a question back or retires it.
    await guardAcademyMutation(request, user.id)
    const keys = body && typeof body === 'object' ? Object.keys(body) : []
    if (keys.includes('isActive') && keys.length > 1) {
      throw new AcademyError('Send isActive on its own, or edit the question without it.', 400)
    }
    const toggle = keys.length === 1 && typeof body.isActive === 'boolean'
    const question = toggle
      ? await (body.isActive ? reactivateQuestion(prisma, id) : retireQuestion(prisma, id))
      : await updateQuestion(prisma, id, body)
    return NextResponse.json({ success: true, question, data: question })
  } catch (error) {
    return academyErrorResponse(error)
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params

    // Retire, never remove, so old reviews still resolve.
    await guardAcademyMutation(request, user.id)
    const question = await retireQuestion(prisma, id)
    return NextResponse.json({ success: true, question, data: question })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
