import Link from 'next/link'
import { CheckCircle2, Hourglass } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACADEMY_THEME_VARS } from './brand'
import { academySans, academySerif } from './fonts'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={ACADEMY_THEME_VARS}
      className={cn(academySans.className, academySerif.variable, 'flex min-h-full items-center justify-center bg-academy-paper px-5 py-16 text-academy-navy')}
    >
      <div className="w-full max-w-md rounded-2xl border border-academy-line bg-white p-8 text-center">{children}</div>
    </div>
  )
}

/** A new hire whose course has not been released yet. */
export function WaitingPanel() {
  return (
    <Shell>
      <span aria-hidden className="mx-auto flex size-12 items-center justify-center rounded-full bg-academy-blue-tint text-academy-blue-dark">
        <Hourglass className="size-6" />
      </span>
      <h1 className="mt-5 text-2xl font-extrabold tracking-tight">Your course isn&apos;t ready yet</h1>
      <p className="mt-3 text-academy-slate">We&apos;re getting everything set up for you. Check back soon.</p>
    </Shell>
  )
}

/** An existing employee who reached the onboarding page: there is nothing here for them. */
export function NothingToDoPanel() {
  return (
    <Shell>
      <span aria-hidden className="mx-auto flex size-12 items-center justify-center rounded-full bg-academy-blue-tint text-academy-blue-dark">
        <CheckCircle2 className="size-6" />
      </span>
      <h1 className="mt-5 text-2xl font-extrabold tracking-tight">Nothing to do here</h1>
      <p className="mt-3 text-academy-slate">This page is for new hires going through onboarding.</p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-11 items-center rounded-xl bg-academy-blue px-6 font-semibold text-white hover:bg-academy-blue-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-academy-blue"
      >
        Go to your dashboard
      </Link>
    </Shell>
  )
}
