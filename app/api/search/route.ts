import { NextResponse, type NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { checkRateLimit, RateLimitUnavailableError } from '@/lib/rate-limit'
import { parseSearchQuery } from '@/lib/search/query'
import { EMPTY_RESULTS, searchEverything } from '@/lib/search/service'

export const dynamic = 'force-dynamic'

const SEARCHES_PER_WINDOW = 300
const NO_STORE = { 'Cache-Control': 'no-store' }

function respond(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE })
}

export async function GET(request: NextRequest) {
  const user = await getSession()
  if (!user) return respond({ success: false, error: 'Unauthorized' }, 401)

  const q = parseSearchQuery(request.nextUrl.searchParams.get('q'))
  if (!q) return respond({ success: true, data: EMPTY_RESULTS })

  try {
    const limit = await checkRateLimit(`search:${user.id}`, SEARCHES_PER_WINDOW)
    if (!limit.allowed) {
      return respond({ success: false, error: 'Too many searches. Wait a moment and try again.' }, 429)
    }
  } catch (error) {
    if (!(error instanceof RateLimitUnavailableError)) {
      console.error('[search] failed', { error })
      return respond({ success: false, error: 'Search is unavailable right now. Try again.' }, 500)
    }
    console.warn('[search] rate limiter unavailable; allowing request')
  }

  try {
    const data = await searchEverything(
      {
        id: user.id,
        role: user.role,
        position: user.position,
        department: user.department,
        teamTag: user.teamTag,
      },
      q
    )
    return respond({ success: true, data })
  } catch (error) {
    console.error('[search] failed', { error })
    return respond({ success: false, error: 'Search is unavailable right now. Try again.' }, 500)
  }
}
