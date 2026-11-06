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
    if (slug === BANK_MODULE_SLUG) after(() => notifyPaymentSetupDone(prisma, user.id, user.name))
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return academyErrorResponse(error)
  }
}
