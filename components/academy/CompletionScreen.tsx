import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Download } from 'lucide-react'
import type { CompletionView } from '@/lib/academy/view'
import { formatCertificateDate } from '@/lib/academy/view-labels'
import { cn } from '@/lib/utils'
import { ACADEMY_THEME_VARS } from './brand'
import { Confetti } from './Confetti'
import { academySans, academySerif } from './fonts'

const CERTIFICATE_HREF = '/api/onboarding/academy/certificate'
const DASHBOARD_HREF = '/dashboard'
const FOCUS_ON_BLUE = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'

interface CompletionScreenProps {
  view: CompletionView
  userId: string
  timeZone: string | null
}

/** The PDF's wording, so the card on screen and the download read the same. */
function CertificateCard({ name, date }: { name: string; date: string }) {
  return (
    <section
      aria-label="Your certificate"
      className="mt-9 w-full max-w-md rounded-2xl bg-academy-paper p-2 text-academy-navy shadow-[0_24px_48px_-16px_rgb(23_38_92/0.5)]"
    >
      <div className="rounded-xl border-2 border-academy-blue px-5 py-6 sm:px-8">
        <Image src="/images/logo.png" alt="Plutus21" width={56} height={56} priority className="mx-auto mix-blend-multiply" />
        <p className="mt-3 text-lg font-bold tracking-tight">Certificate of Completion</p>
        <p className={`${academySerif.className} mt-3 text-balance text-[1.75rem] leading-tight text-academy-blue [overflow-wrap:anywhere]`}>{name}</p>
        <p className="mt-3 text-sm">has completed the Plutus21 Onboarding Academy</p>
        <p className="mt-2 text-sm font-bold">{date}</p>
      </div>
    </section>
  )
}

export function CompletionScreen({ view, userId, timeZone }: CompletionScreenProps) {
  return (
    <div
      style={ACADEMY_THEME_VARS}
      className={cn(
        academySans.className,
        academySerif.variable,
        'relative flex min-h-[calc(100dvh-3.5rem)] flex-col items-center justify-center overflow-hidden bg-academy-blue px-5 py-12 text-center text-white selection:bg-white/25 sm:py-16',
      )}
    >
      <Confetti userId={userId} />
      <div className="relative flex w-full max-w-2xl flex-col items-center">
        <h1 className="text-balance text-[2.5rem] font-extrabold leading-[1.04] tracking-tight sm:text-[4rem]">
          WELCOME TO THE{' '}
          <span className={`${academySerif.className} text-[1.15em] font-normal italic tracking-normal`}>Journey</span>
        </h1>
        <p className="mt-5 max-w-xl text-balance text-lg leading-relaxed sm:text-xl">
          You are not just starting a new job. You are joining a team that believes in you.
        </p>
        <CertificateCard name={view.name} date={formatCertificateDate(view.completedAt, timeZone)} />
        <a
          href={CERTIFICATE_HREF}
          download
          className={cn(
            'mt-8 inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-white px-8 text-lg font-semibold text-academy-navy transition-colors hover:bg-academy-blue-tint sm:w-fit',
            FOCUS_ON_BLUE,
          )}
        >
          <Download aria-hidden className="size-5" />
          Download your certificate
        </a>
        <Link
          href={DASHBOARD_HREF}
          className={cn('mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 font-semibold underline underline-offset-4', FOCUS_ON_BLUE)}
        >
          Go to Compass
          <ArrowRight aria-hidden className="size-5" />
        </Link>
      </div>
    </div>
  )
}
