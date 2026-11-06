import { after, NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireAcademyHr } from '@/lib/academy/hr-route'
import { academyErrorResponse, guardAcademyMutation } from '@/lib/academy/http'
import { assignModule, listAssignable, notifyAssigned } from '@/lib/academy/service/assignment'

const MAX_PEOPLE = 1000

// All active is one long transaction, then the notices in after().
export const maxDuration = 300

const bodySchema = z
  .object({
    moduleId: z.string().min(1).max(100),
    userIds: z.union([z.literal('ALL_ACTIVE'), z.array(z.string().min(1).max(100)).min(1).max(MAX_PEOPLE)]),
  })
  .strict()

export async function GET() {
  try {
    await requireAcademyHr()
    return NextResponse.json({ success: true, data: await listAssignable(prisma) })
  } catch (error) {
    return academyErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAcademyHr()
    await guardAcademyMutation(request, user.id)
    const { moduleId, userIds } = bodySchema.parse(await request.json())
    const { assigned, notice } = await assignModule(prisma, moduleId, userIds, user.id)
    after(() => notifyAssigned(prisma, notice))
    return NextResponse.json({ success: true, data: { assigned } })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
