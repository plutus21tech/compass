import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const QUIZ_ACTION_CLASS = 'h-11 rounded-xl px-4 text-[15px]'
const HOME_HREF = '/onboarding'

/** The module page's sticky footer. On a phone the note sits on its own line above the buttons. */
export function QuizFooter({ back, note, action }: { back: React.ReactNode; note?: React.ReactNode; action: React.ReactNode }) {
  return (
    <footer className="sticky bottom-0 z-20 mt-auto border-t border-academy-line bg-academy-paper pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
      <div className="mx-auto grid w-full max-w-[720px] grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-5 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        {back}
        {note ? (
          <div className="col-span-2 text-sm leading-5 text-academy-navy max-sm:order-first sm:col-span-1 sm:text-right">{note}</div>
        ) : (
          <span aria-hidden className="max-sm:hidden" />
        )}
        <div className="col-start-2 justify-self-end sm:col-start-3">{action}</div>
      </div>
    </footer>
  )
}

export function HomeLink({ label = 'Back to Home' }: { label?: string }) {
  return (
    <Button asChild variant="outline" className={cn(QUIZ_ACTION_CLASS, 'bg-white')}>
      <Link href={HOME_HREF} prefetch={false}>
        <ArrowLeft aria-hidden />
        {label}
      </Link>
    </Button>
  )
}
