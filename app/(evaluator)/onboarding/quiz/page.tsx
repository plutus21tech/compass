import { redirect } from 'next/navigation'
import { QuizFlow } from '@/components/academy/quiz/QuizFlow'
import { AcademyError } from '@/lib/academy/errors'
import { loadCompletion } from '@/lib/academy/service/completion'
import { loadHireFacts } from '@/lib/academy/service/context'
import { loadQuiz, type QuizView } from '@/lib/academy/service/quiz'
import { timeZoneFor } from '@/lib/academy/time'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

/** Null means no released course. Anything else is a real failure. */
async function readQuiz(userId: string): Promise<QuizView | null> {
  try {
    return await loadQuiz(prisma, userId)
  } catch (error) {
    if (error instanceof AcademyError && error.status === 404) return null
    throw error
  }
}

export default async function OnboardingQuizRoute() {
  const user = await getSession()
  if (!user) redirect('/login')

  const quiz = await readQuiz(user.id)
  if (!quiz || quiz.status === 'LOCKED') redirect('/onboarding')
  // A hire who is DONE but hasn't finished stays here: signing again retries the finish.
  if (quiz.status === 'DONE' && (await loadCompletion(prisma, user.id))) redirect('/onboarding/complete')

  const facts = await loadHireFacts(prisma, user.id)
  return <QuizFlow view={quiz} name={user.name} timeZone={facts ? timeZoneFor(facts.attributes) : null} />
}
