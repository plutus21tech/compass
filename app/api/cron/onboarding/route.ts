import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { onboardingCronGate } from '@/lib/academy/reminders'
import { emailSenders, runOnboardingJob } from '@/lib/academy/service/reminders'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const gate = onboardingCronGate(request.headers.get('authorization'))
  if (gate.action === 'refuse') return NextResponse.json({ error: 'Unauthorized' }, { status: gate.status })
  if (gate.action === 'skip') return NextResponse.json({ skipped: 'The Onboarding Academy is off' })
  try {
    return NextResponse.json({ success: true, ...(await runOnboardingJob(prisma, new Date(), emailSenders)) })
  } catch (error) {
    console.error('[academy] reminder job failed', { error: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'The onboarding job failed' }, { status: 500 })
  }
}
