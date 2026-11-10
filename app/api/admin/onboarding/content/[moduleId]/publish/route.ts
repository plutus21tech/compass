import { after, NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { academyErrorResponse, guardAcademyMutation } from '@/lib/academy/http'
import { notifyAssigned } from '@/lib/academy/service/assignment'
import { publishModule } from '@/lib/academy/service/content'

const MAX_CHANGE_NOTE = 500

// A re-read is one long transaction over everyone, then the notices in after().
export const maxDuration = 300

interface RouteContext {
  params: Promise<{ moduleId: string }>
}

const bodySchema = z
  .object({
    changeNote: z.string().trim().min(1, 'Add a short note about what changed.').max(MAX_CHANGE_NOTE, 'The change note is too long.'),
    askReread: z.boolean(),
    expectedUpdatedAt: z.string().datetime(),
  })
  .strict()

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademyHr()
    await guardAcademyMutation(request, user.id)
    const { moduleId } = await context.params
    const input = bodySchema.parse(await request.json())
    const { notice, ...result } = await publishModule(prisma, moduleId, input, user.id)
    if (notice) after(() => notifyAssigned(prisma, notice))
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
