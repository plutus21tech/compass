import { redirect } from 'next/navigation'
import { isAcademyEnabled } from '@/lib/academy/flag'
import LegacyModulesPage from './LegacyModulesPage'

// Read the flag on every request: a prerendered page would keep the value from build time.
export const dynamic = 'force-dynamic'

export default function OnboardingModulesRoute() {
  if (isAcademyEnabled()) redirect('/admin/onboarding/academy/modules')
  return <LegacyModulesPage />
}
