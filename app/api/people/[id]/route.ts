import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { checkRateLimit, RateLimitUnavailableError } from '@/lib/rate-limit'
import { loadPersonProfile } from '@/lib/people/profile'

type RouteContext = { params: Promise<{ id: string }> }

const PROFILE_REQUESTS_PER_WINDOW = 120

async function isRateLimited(userId: string): Promise<boolean> {
  try {
    return !(await checkRateLimit(`people-profile:${userId}`, PROFILE_REQUESTS_PER_WINDOW)).allowed
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) return false
    throw error
  }
}

/**
 * GET /api/people/[id] — a person's profile. People outside the viewer's company, people
 * who have left and ids that do not exist all answer 404, so the response never says which.
 */
export async function GET(_request: Request, { params }: RouteContext) {
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

    const { id } = await params
    const data = await loadPersonProfile({ id: user.id, role: user.role, department: user.department }, id)
    if (!data) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[people/profile] Failed to load a profile:', error)
    return NextResponse.json(
      { success: false, error: 'Could not load this profile. Try again.' },
      { status: 500 }
    )
  }
}
