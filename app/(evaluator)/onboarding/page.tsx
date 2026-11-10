import { redirect } from 'next/navigation'
import { AcademyHome } from '@/components/academy/AcademyHome'
import { getSession } from '@/lib/auth'
import { loadCompletion } from '@/lib/academy/service/completion'
import { loadHome } from '@/lib/academy/service/course'
import { prisma } from '@/lib/db'

export default async function OnboardingRoute() {
  const user = await getSession()
  if (!user) redirect('/login')

  const view = await loadHome(prisma, user.id)
  // loadCompletion, not onboardingCompleted alone: /onboarding/complete sends anyone it refuses back here.
  if (view.released && user.onboardingCompleted && (await loadCompletion(prisma, user.id))) redirect('/onboarding/complete')
  return <AcademyHome view={view} hireWaiting={user.onboardingCompleted === false} />
}
