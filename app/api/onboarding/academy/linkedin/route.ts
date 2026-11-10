import { after, NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation, requireAcademySession } from '@/lib/academy/http'
import { saveLinkedinUrl } from '@/lib/academy/service/fields'
import { notifyLinkedinSubmitted } from '@/lib/academy/service/notify'

const bodySchema = z.object({ linkedinUrl: z.string() }).strict()

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAcademySession()
    await guardAcademyMutation(request, user.id)
    const { linkedinUrl } = bodySchema.parse(await request.json())
    await saveLinkedinUrl(prisma, user.id, linkedinUrl)
    after(() => notifyLinkedinSubmitted(prisma, user.id, user.name))
    return NextResponse.json({ success: true })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
