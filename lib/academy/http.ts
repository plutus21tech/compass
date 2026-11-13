import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { getSession, type SafeUser } from '@/lib/auth'
import { formatZodIssues } from './profile-input'
import { AcademyError } from './errors'
import { mutationLimitFor, rateLimitMessage, type MutationBucket } from './rate-limits'
import { checkRateLimit, RateLimitUnavailableError } from '@/lib/rate-limit'
import { assertSameOrigin, SameOriginError } from '@/lib/security/same-origin'

export { AcademyError }

export async function requireAcademySession(): Promise<SafeUser> {
  const user = await getSession()
  if (!user) throw new AcademyError('Unauthorized', 401)
  return user
}

const TOO_LARGE_MESSAGE = 'That request is too large.'

/**
 * Reads a JSON body of at most `maxChars`, refusing a larger one with 413 before parsing it. A
 * declared length over the cap is refused without reading. Bad JSON throws a SyntaxError (a 400).
 */
export async function readBoundedJson(request: Request, maxChars: number): Promise<unknown> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxChars) throw new AcademyError(TOO_LARGE_MESSAGE, 413)
  const text = await request.text()
  if (text.length > maxChars) throw new AcademyError(TOO_LARGE_MESSAGE, 413)
  return JSON.parse(text) as unknown
}

/** Same-origin and rate-limit guard for Academy writes. */
export async function guardAcademyMutation(
  request: NextRequest, userId: string, bucket: MutationBucket = 'default',
): Promise<void> {
  assertSameOrigin(request.headers, request.url)
  try {
    const { key, max } = mutationLimitFor(userId, bucket)
    const limit = await checkRateLimit(key, max)
    if (!limit.allowed) throw new AcademyError(rateLimitMessage(bucket), 429)
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) {
      console.warn('[academy] rate limiter unavailable; allowing request')
      return
    }
    throw error
  }
}

export function academyErrorResponse(error: unknown): NextResponse {
  const fail = (message: string, status: number) => NextResponse.json({ success: false, error: message }, { status })
  if (error instanceof AcademyError) return fail(error.message, error.status)
  if (error instanceof SameOriginError) return fail(error.message, 403)
  if (error instanceof SyntaxError) return fail('The request body is not valid JSON', 400)
  if (error instanceof ZodError) {
    return fail(formatZodIssues(error), 400)
  }
  console.error('[academy] unexpected error', error)
  return fail('Something went wrong. Reload and try again.', 500)
}
