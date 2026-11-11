import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { markBellRead } from '@/lib/notifications/service'
import { checkRateLimit, RateLimitUnavailableError } from '@/lib/rate-limit'
import { isSecurityChecksEnabled } from '@/lib/security-checks/flag'
import { assertSameOrigin, SameOriginError } from '@/lib/security/same-origin'

export const dynamic = 'force-dynamic'

const MUTATIONS_PER_WINDOW = 120

const bodySchema = z
  .object({
    refs: z
      .array(z.object({ source: z.enum(['compass', 'security']), id: z.string().min(1).max(64) }).strict())
      .min(1)
      .max(60),
  })
  .strict()

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status })
}

export async function POST(request: NextRequest) {
  const user = await getSession()
  if (!user) return fail('Unauthorized', 401)
  try {
    assertSameOrigin(request.headers, request.url)
  } catch (error) {
    if (error instanceof SameOriginError) return fail(error.message, 403)
    throw error
  }
  try {
    const limit = await checkRateLimit(`notifications:${user.id}`, MUTATIONS_PER_WINDOW)
    if (!limit.allowed) return fail('Too many requests. Wait a few minutes and try again.', 429)
  } catch (error) {
    if (!(error instanceof RateLimitUnavailableError)) {
      console.error('[notifications] rate limit check failed', { userId: user.id, error })
      return fail('Could not update notifications.', 500)
    }
    console.warn('[notifications] rate limiter unavailable; allowing request')
  }
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return fail('The request body is not valid JSON', 400)
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return fail('Invalid notification references', 400)
  try {
    const updated = await markBellRead(user.id, parsed.data.refs, new Date(), { securityChecks: isSecurityChecksEnabled() })
    return NextResponse.json({ success: true, data: { updated } })
  } catch (error) {
    console.error('[notifications] mark read failed', { userId: user.id, error })
    return fail('Could not update notifications.', 500)
  }
}
