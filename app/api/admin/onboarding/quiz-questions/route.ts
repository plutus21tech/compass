import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageOnboarding } from '@/lib/permissions'
import { academyErrorResponse, guardAcademyMutation } from '@/lib/academy/http'
import { createQuestion, listQuestions } from '@/lib/academy/service/quiz-editor'

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // The questions with the usable count and the minimum, in the Academy envelope.
    return NextResponse.json({ success: true, data: await listQuestions(prisma) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // An explanation is required; the order is picked by the server.
    await guardAcademyMutation(request, user.id)
    const body: unknown = await request.json()
    const question = await createQuestion(prisma, body)
    return NextResponse.json({ success: true, question, data: question }, { status: 201 })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
