import type { SafeUser } from '@/lib/auth'
import { canManageOnboarding } from '@/lib/permissions'
import { AcademyError } from './errors'
import { requireAcademySession } from './http'

/** Flag on, signed in, and HR (canManageOnboarding is HR only). */
export async function requireAcademyHr(): Promise<SafeUser> {
  const user = await requireAcademySession()
  if (!canManageOnboarding(user.role)) throw new AcademyError('Forbidden', 403)
  return user
}
