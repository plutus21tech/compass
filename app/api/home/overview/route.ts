import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { checkRateLimit, RateLimitUnavailableError } from '@/lib/rate-limit'
import { loadHomeOverview } from '@/lib/home/overview'

export const dynamic = 'force-dynamic'

const OVERVIEW_REQUESTS_PER_WINDOW = 120

async function isRateLimited(userId: string): Promise<boolean> {
  try {
    return !(await checkRateLimit(`home-overview:${userId}`, OVERVIEW_REQUESTS_PER_WINDOW)).allowed
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) return false
    throw error
  }
}

/** GET /api/home/overview — who is out today and the viewer's team holidays. */
export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    if (await isRateLimited(user.id)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Wait a moment and try again.' },
        { status: 429 }
      )
    }

    const data = await loadHomeOverview(
      { id: user.id, department: user.department, teamTag: user.teamTag },
      new Date()
    )
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[home] overview failed', { error })
    return NextResponse.json(
      { success: false, error: 'Could not load today’s overview. Try again.' },
      { status: 500 }
    )
  }
}
