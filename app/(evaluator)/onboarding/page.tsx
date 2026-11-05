import { redirect } from 'next/navigation'
import { AcademyHome } from '@/components/academy/AcademyHome'
import { getSession } from '@/lib/auth'
import { isAcademyEnabled } from '@/lib/academy/flag'
import { loadHome } from '@/lib/academy/service/course'
import { prisma } from '@/lib/db'
import LegacyOnboardingHub from './LegacyOnboardingHub'

export default async function OnboardingRoute() {
  if (!isAcademyEnabled()) return <LegacyOnboardingHub />

  const user = await getSession()
  if (!user) redirect('/login')

  const view = await loadHome(prisma, user.id)
  return <AcademyHome view={view} hireWaiting={user.onboardingCompleted === false} />
}
