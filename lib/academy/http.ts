import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getSession, type SafeUser } from '@/lib/auth'
import { formatZodIssues } from './profile-input'
import { isAcademyEnabled } from './flag'

export class AcademyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'AcademyError'
  }
}

export async function requireAcademySession(): Promise<SafeUser> {
  if (!isAcademyEnabled()) throw new AcademyError('Not found', 404)
  const user = await getSession()
  if (!user) throw new AcademyError('Unauthorized', 401)
  return user
}

export function academyErrorResponse(error: unknown): NextResponse {
  const fail = (message: string, status: number) => NextResponse.json({ success: false, error: message }, { status })
  if (error instanceof AcademyError) return fail(error.message, error.status)
  if (error instanceof ZodError) {
    return fail(formatZodIssues(error), 400)
  }
  console.error('[academy] unexpected error', error)
  return fail('Something went wrong. Reload and try again.', 500)
}
