import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { checkRateLimit, RateLimitUnavailableError } from '@/lib/rate-limit'
import { loadCompanyMap } from '@/lib/people/directory'

const MAP_REQUESTS_PER_WINDOW = 60

async function isRateLimited(userId: string): Promise<boolean> {
  try {
    return !(await checkRateLimit(`people-map:${userId}`, MAP_REQUESTS_PER_WINDOW)).allowed
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) return false
    throw error
  }
}

/** GET /api/people/company-map — TEAM_LEAD reporting lines for the People page. 3E viewers get 404. */
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

    const data = await loadCompanyMap({ id: user.id, department: user.department })
    if (!data) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[people/company-map] Failed to load the company map:', error)
    return NextResponse.json(
      { success: false, error: 'Could not load the company map. Try again.' },
      { status: 500 }
    )
  }
}
