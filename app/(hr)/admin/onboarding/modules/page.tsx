import { redirect } from 'next/navigation'

/** The old modules address; the editor lives under the Academy settings. */
export default function OnboardingModulesRoute() {
  redirect('/admin/onboarding/academy/modules')
}
