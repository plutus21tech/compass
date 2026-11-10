import { redirect } from 'next/navigation'
import { AcademyHome } from '@/components/academy/AcademyHome'
import { getSession } from '@/lib/auth'
import { isAcademyEnabled } from '@/lib/academy/flag'
import { loadCompletion } from '@/lib/academy/service/completion'
import { loadHome } from '@/lib/academy/service/course'
import { prisma } from '@/lib/db'
import LegacyOnboardingHub from './LegacyOnboardingHub'

export default async function OnboardingRoute() {
  if (!isAcademyEnabled()) return <LegacyOnboardingHub />

  const user = await getSession()
  if (!user) redirect('/login')

  const view = await loadHome(prisma, user.id)
  // loadCompletion, not the flag alone: /onboarding/complete sends anyone it refuses back here.
  if (view.released && user.onboardingCompleted && (await loadCompletion(prisma, user.id))) redirect('/onboarding/complete')
  return <AcademyHome view={view} hireWaiting={user.onboardingCompleted === false} />
}
