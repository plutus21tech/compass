import { redirect } from 'next/navigation'
import { CompletionScreen } from '@/components/academy/CompletionScreen'
import { getSession } from '@/lib/auth'
import { isAcademyEnabled } from '@/lib/academy/flag'
import { loadCompletion } from '@/lib/academy/service/completion'
import { loadHireFacts } from '@/lib/academy/service/context'
import { timeZoneFor } from '@/lib/academy/time'
import { prisma } from '@/lib/db'

const HOME_HREF = '/onboarding'

/** Decided by loadCompletion alone: anyone who hasn't finished the Academy goes home. */
export default async function OnboardingCompleteRoute() {
  if (!isAcademyEnabled()) redirect(HOME_HREF)

  const user = await getSession()
  if (!user) redirect('/login')

  const view = await loadCompletion(prisma, user.id)
  if (!view) redirect(HOME_HREF)

  const facts = await loadHireFacts(prisma, user.id)
  return <CompletionScreen view={view} userId={user.id} timeZone={facts ? timeZoneFor(facts.attributes) : null} />
}
