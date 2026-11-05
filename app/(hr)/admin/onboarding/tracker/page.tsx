import { notFound } from 'next/navigation'
import { TrackerScreen } from '@/components/academy/hr/TrackerScreen'
import { isAcademyEnabled } from '@/lib/academy/flag'

// Read the flag on every request: a prerendered page would keep the value from build time.
export const dynamic = 'force-dynamic'

export default function OnboardingTrackerPage() {
  if (!isAcademyEnabled()) notFound()
  return <TrackerScreen />
}
