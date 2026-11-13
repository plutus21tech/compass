import { redirect } from 'next/navigation'

/** The old quiz address; the editor lives under the Academy settings. */
export default function OnboardingQuizRoute() {
  redirect('/admin/onboarding/academy/quiz')
}
