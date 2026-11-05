import { after, NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation, requireAcademySession } from '@/lib/academy/http'
import { notifyCourseCompleted, signValuesAcknowledgement } from '@/lib/academy/service/completion'

// Only the typed name: the statement is fixed on the server.
const bodySchema = z.object({ typedName: z.string().max(200) }).strict()

export async function POST(request: NextRequest) {
  try {
    const user = await requireAcademySession()
    await guardAcademyMutation(request, user.id)
    const { typedName } = bodySchema.parse(await request.json())
    const { signedAt, completed } = await signValuesAcknowledgement(prisma, user.id, typedName)
    if (completed) after(() => notifyCourseCompleted(user.id))
    return NextResponse.json({ success: true, data: { signedAt: signedAt.toISOString(), completed } })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
