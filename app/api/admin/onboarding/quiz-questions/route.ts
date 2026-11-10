import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageOnboarding } from '@/lib/permissions'
import { isAcademyEnabled } from '@/lib/academy/flag'
import { academyErrorResponse, guardAcademyMutation } from '@/lib/academy/http'
import { createQuestion, listQuestions } from '@/lib/academy/service/quiz-editor'

function parseOptions(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const options = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
  return options.length >= 2 ? options : null
}

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Flag on: the questions with the usable count and the minimum, in the Academy envelope.
    if (isAcademyEnabled()) return NextResponse.json({ success: true, data: await listQuestions(prisma) })

    const questions = await prisma.onboardingQuizQuestion.findMany({
      orderBy: { orderIndex: 'asc' },
    })
    return NextResponse.json({ questions })
  } catch (error) {
    if (isAcademyEnabled()) return academyErrorResponse(error)
    console.error('Failed to fetch quiz questions:', error)
    return NextResponse.json({ error: 'Failed to fetch quiz questions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Flag on: the new schema (explanation required); the order is picked by the server.
    if (isAcademyEnabled()) {
      await guardAcademyMutation(request, user.id)
      const body: unknown = await request.json()
      const question = await createQuestion(prisma, body)
      return NextResponse.json({ success: true, question, data: question }, { status: 201 })
    }

    const body = await request.json()
    const questionText = typeof body.questionText === 'string' ? body.questionText.trim() : ''
    const options = parseOptions(body.options)
    const correctAnswer = typeof body.correctAnswer === 'string' ? body.correctAnswer.trim() : ''
    const orderIndex = Number.isInteger(body.orderIndex) ? body.orderIndex : null

    if (!questionText || !options || !correctAnswer || !orderIndex) {
      return NextResponse.json(
        { error: 'questionText, options (>=2), correctAnswer, and orderIndex are required' },
        { status: 400 }
      )
    }

    if (!options.includes(correctAnswer)) {
      return NextResponse.json({ error: 'correctAnswer must match one of the options' }, { status: 400 })
    }

    const question = await prisma.onboardingQuizQuestion.create({
      data: {
        questionText,
        optionsJson: options,
        correctAnswer,
        orderIndex,
        isActive: body.isActive !== false,
      },
    })

    return NextResponse.json({ success: true, question })
  } catch (error) {
    if (isAcademyEnabled()) return academyErrorResponse(error)
    console.error('Failed to create quiz question:', error)
    return NextResponse.json({ error: 'Failed to create quiz question' }, { status: 500 })
  }
}
