import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { AcademyError } from '@/lib/academy/errors'
import { isAcademyEnabled } from '@/lib/academy/flag'
import { guardAcademyMutation } from '@/lib/academy/http'
import { quizResetUserData } from '@/lib/academy/lockout'
import { clearQuizAttempts } from '@/lib/academy/service/quiz'
import { canManageOnboarding } from '@/lib/permissions'
import { SameOriginError } from '@/lib/security/same-origin'

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const academyEnabled = isAcademyEnabled()
    if (academyEnabled) await guardAcademyMutation(request, user.id)

    const body = await request.json()
    const userId = typeof body.userId === 'string' ? body.userId : ''
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    if (academyEnabled) {
      await clearQuizAttempts(prisma, userId)
      return NextResponse.json({ success: true })
    }

    await prisma.$transaction([
      prisma.quizAttempt.deleteMany({
        where: { userId },
      }),
      prisma.user.update({
        where: { id: userId },
        data: quizResetUserData(academyEnabled),
      }),
      prisma.newHire.updateMany({
        where: { userId },
        data: { status: 'ONBOARDING' },
      }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof AcademyError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    if (error instanceof SameOriginError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('Failed to reset quiz attempts:', error)
    return NextResponse.json({ error: 'Failed to reset quiz attempts' }, { status: 500 })
  }
}
