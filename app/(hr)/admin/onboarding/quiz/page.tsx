import { redirect } from 'next/navigation'
import { isAcademyEnabled } from '@/lib/academy/flag'
import LegacyQuizPage from './LegacyQuizPage'

// Read the flag on every request: a prerendered page would keep the value from build time.
export const dynamic = 'force-dynamic'

export default function OnboardingQuizRoute() {
  if (isAcademyEnabled()) redirect('/admin/onboarding/academy/quiz')
  return <LegacyQuizPage />
}
