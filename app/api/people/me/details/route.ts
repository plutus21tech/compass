import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { checkRateLimit, RateLimitUnavailableError } from '@/lib/rate-limit'
import { saveProfileDetails } from '@/lib/people/profile'
import { profileDetailsSchema } from '@/lib/people/profile-rules'

const SAVES_PER_WINDOW = 30

async function isRateLimited(userId: string): Promise<boolean> {
  try {
    return !(await checkRateLimit(`people-profile-save:${userId}`, SAVES_PER_WINDOW)).allowed
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) return false
    throw error
  }
}

/** PUT /api/people/me/details — the session user's own "about me" answers. Nobody else's. */
export async function PUT(request: Request) {
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

    const body: unknown = await request.json().catch(() => null)
    const parsed = profileDetailsSchema.safeParse(body)
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Check your answers and try again.'
      return NextResponse.json({ success: false, error: message }, { status: 400 })
    }

    const data = await saveProfileDetails(user.id, parsed.data)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('[people/profile] Failed to save profile details:', error)
    return NextResponse.json(
      { success: false, error: 'Could not save your profile. Try again.' },
      { status: 500 }
    )
  }
}
