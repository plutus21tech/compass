import { after, NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { academyErrorResponse, guardAcademyMutation, requireAcademySession } from '@/lib/academy/http'
import { BANK_MODULE_SLUG } from '@/lib/academy/service/fields'
import { notifyPaymentSetupDone } from '@/lib/academy/service/notify-oa'
import { completeModule } from '@/lib/academy/service/progress'

interface RouteContext {
  params: Promise<{ slug: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireAcademySession()
    await guardAcademyMutation(request, user.id)
    const { slug } = await context.params
    const data = await completeModule(prisma, user.id, slug)
    // Only a course row has a next module: an assigned re-read tells OA nothing new.
    if (slug === BANK_MODULE_SLUG && data.nextSlug) after(() => notifyPaymentSetupDone(prisma, user.id, user.name))
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
