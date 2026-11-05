import { redirect } from 'next/navigation'
import { isAcademyEnabled } from '@/lib/academy/flag'
import LegacyQuizPage from './LegacyQuizPage'

export default function OnboardingQuizRoute() {
  // With the Academy on, the legacy quiz API answers 401, and the culture quiz is not part of this stage.
  if (isAcademyEnabled()) redirect('/onboarding')
  return <LegacyQuizPage />
}
