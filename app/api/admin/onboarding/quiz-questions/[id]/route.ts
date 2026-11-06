import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageOnboarding } from '@/lib/permissions'
import { isAcademyEnabled } from '@/lib/academy/flag'
import { academyErrorResponse, guardAcademyMutation } from '@/lib/academy/http'
import { reactivateQuestion, retireQuestion, updateQuestion } from '@/lib/academy/service/quiz-editor'

interface RouteContext {
  params: Promise<{ id: string }>
}

function parseOptions(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const options = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
  return options.length >= 2 ? options : null
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const body = await request.json()

    // Flag on: the new schema. { isActive } alone brings a question back or retires it.
    if (isAcademyEnabled()) {
      await guardAcademyMutation(request, user.id)
      const keys = body && typeof body === 'object' ? Object.keys(body) : []
      const toggle = keys.length === 1 && typeof body.isActive === 'boolean'
      const question = toggle
        ? await (body.isActive ? reactivateQuestion(prisma, id) : retireQuestion(prisma, id))
        : await updateQuestion(prisma, id, body)
      return NextResponse.json({ success: true, question, data: question })
    }

    const options = body.options !== undefined ? parseOptions(body.options) : undefined
    const correctAnswer = typeof body.correctAnswer === 'string' ? body.correctAnswer.trim() : undefined

    if (options !== undefined && !options) {
      return NextResponse.json({ error: 'options must contain at least 2 values' }, { status: 400 })
    }

    if (options && correctAnswer && !options.includes(correctAnswer)) {
      return NextResponse.json({ error: 'correctAnswer must match one of the options' }, { status: 400 })
    }

    const existing = await prisma.onboardingQuizQuestion.findUnique({
      where: { id },
      select: { optionsJson: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Quiz question not found' }, { status: 404 })
    }

    const effectiveOptions = (options ?? existing.optionsJson) as unknown
    if (correctAnswer && Array.isArray(effectiveOptions) && !effectiveOptions.includes(correctAnswer)) {
      return NextResponse.json({ error: 'correctAnswer must match one of the current options' }, { status: 400 })
    }

    const updated = await prisma.onboardingQuizQuestion.update({
      where: { id },
      data: {
        ...(typeof body.questionText === 'string' ? { questionText: body.questionText.trim() } : {}),
        ...(options ? { optionsJson: options } : {}),
        ...(correctAnswer ? { correctAnswer } : {}),
        ...(Number.isInteger(body.orderIndex) ? { orderIndex: body.orderIndex } : {}),
        ...(typeof body.isActive === 'boolean' ? { isActive: body.isActive } : {}),
      },
    })

    return NextResponse.json({ success: true, question: updated })
  } catch (error) {
    if (isAcademyEnabled()) return academyErrorResponse(error)
    console.error('Failed to update quiz question:', error)
    return NextResponse.json({ error: 'Failed to update quiz question' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params

    // Flag on: retire, never remove, so old reviews still resolve.
    if (isAcademyEnabled()) {
      await guardAcademyMutation(_request, user.id)
      const question = await retireQuestion(prisma, id)
      return NextResponse.json({ success: true, question, data: question })
    }

    await prisma.onboardingQuizQuestion.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isAcademyEnabled()) return academyErrorResponse(error)
    console.error('Failed to delete quiz question:', error)
    return NextResponse.json({ error: 'Failed to delete quiz question' }, { status: 500 })
  }
}
