import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation, requireAcademySession } from '@/lib/academy/http'
import { loadQuiz, notifyQuizFailAlert, submitQuiz } from '@/lib/academy/service/quiz'

const NO_STORE = { 'Cache-Control': 'no-store' }

function failure(error: unknown): NextResponse {
  const response = academyErrorResponse(error)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function GET() {
  try {
    const user = await requireAcademySession()
    return NextResponse.json({ success: true, data: await loadQuiz(prisma, user.id) }, { headers: NO_STORE })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAcademySession()
    await guardAcademyMutation(request, user.id)
    const { result, failAlertDue, failedCount } = await submitQuiz(prisma, user.id, await request.json())
    if (failAlertDue) await notifyQuizFailAlert(user.id, failedCount)
    return NextResponse.json({ success: true, data: result }, { headers: NO_STORE })
  } catch (error) {
    return failure(error)
  }
}
