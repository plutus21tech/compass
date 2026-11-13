'use client'

import { VALUES_STATEMENT } from '@/lib/academy/quiz'
import { academyRequest } from '../api'
import { SignForm } from '../blocks/AcknowledgementBlock'
import { HomeLink, QuizFooter } from './QuizFooter'
import { QuizHeader } from './QuizHeader'

const SIGN_URL = '/api/onboarding/academy/quiz/acknowledgement'
const COMPLETE_HREF = '/onboarding/complete'

interface ValuesAcknowledgementProps {
  /** Shown in the header: the name the hire must type, and the one the server's error points at. */
  name: string
  timeZone: string | null
}

export function ValuesAcknowledgement({ name, timeZone }: ValuesAcknowledgementProps) {
  // `completed` only says this call finished the course: the page decides where a hire belongs.
  // A full load, so the layout re-reads onboardingCompleted and the full sidebar returns.
  const sign = async (typedName: string) => {
    await academyRequest(SIGN_URL, 'POST', { typedName })
    window.location.assign(COMPLETE_HREF)
  }

  return (
    <>
      <QuizHeader lead="VALUES AND CODE OF" accent="Conduct">
        <p className="mt-3 text-[17px] [overflow-wrap:anywhere]">{name}</p>
      </QuizHeader>
      <div className="mx-auto w-full max-w-[720px] flex-1 px-5 py-8 sm:py-10">
        <section className="space-y-5 rounded-2xl bg-academy-navy p-5 text-white sm:p-7">
          <h2 className="text-balance text-xl font-semibold leading-snug">{VALUES_STATEMENT}</h2>
          <SignForm timeZone={timeZone} onSign={sign} />
        </section>
      </div>
      <QuizFooter back={<HomeLink />} action={null} />
    </>
  )
}
