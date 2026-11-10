import { TrackerScreen } from '@/components/academy/hr/TrackerScreen'
import { isAcademyEnabled } from '@/lib/academy/flag'
import LegacyOnboardingDashboard from './LegacyOnboardingDashboard'

// Read the flag on every request: a prerendered page would keep the value from build time.
export const dynamic = 'force-dynamic'

export default function OnboardingAdminRoute() {
  return isAcademyEnabled() ? <TrackerScreen /> : <LegacyOnboardingDashboard />
}
