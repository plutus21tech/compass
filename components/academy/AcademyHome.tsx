import Link from 'next/link'
import { ArrowRight, Clock, PartyPopper } from 'lucide-react'
import type { QuizStatus } from '@/lib/academy/quiz'
import type { HomeQuizView, HomeView, ModuleCardView, ReleasedHomeView } from '@/lib/academy/view'
import { formatAcademyDate, homeNextStep, homePanel, quizCardCopy } from '@/lib/academy/view-labels'
import { cn } from '@/lib/utils'
import { ACADEMY_THEME_VARS } from './brand'
import { academySans, academySerif } from './fonts'
import { BuddyCard, CallsCard } from './HomeSideCards'
import { NothingToDoPanel, WaitingPanel } from './HomeStates'
import { ModuleCard } from './ModuleCard'
import { ProgressRing } from './ProgressRing'
import { QuizCard } from './QuizCard'

const PHASE_HEADINGS = { DAY_1: 'Day 1', WEEK_1: 'Week 1' } as const
const QUIZ_HEADING = 'Final Step: Culture Quiz'

interface AcademyHomeProps {
  view: HomeView
  /** A hire still locked into onboarding, as opposed to an existing employee. */
  hireWaiting: boolean
}

function Hero({ view, timeZone }: { view: ReleasedHomeView; timeZone: string | null }) {
  const comma = view.greeting.indexOf(', ')
  const lead = comma === -1 ? view.greeting : view.greeting.slice(0, comma + 1)
  const name = comma === -1 ? null : view.greeting.slice(comma + 2)
  const role = [view.title, view.department].filter(Boolean).join(' · ')
  return (
    <header className="bg-academy-blue text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-9 sm:flex-row sm:items-center sm:justify-between sm:py-12">
        <div className="min-w-0">
          <h1 className="text-balance text-[1.75rem] font-extrabold leading-[1.1] tracking-tight sm:text-[2.5rem]">
            {lead}
            {name ? (
              <>
                {' '}
                <span className={`${academySerif.className} text-[1.15em] font-normal italic tracking-normal`}>{name}</span>
              </>
            ) : null}
          </h1>
          {role ? <p className="mt-3 text-[17px]">{role}</p> : null}
        </div>
        <div className="flex items-center gap-5">
          <ProgressRing done={view.doneCount} total={view.total} />
          {view.courseDueAt ? (
            <p className="text-[15px] leading-snug">
              <span className="block text-[13px] font-semibold tracking-[0.1em]">DUE</span>
              <span className="text-lg font-semibold">{formatAcademyDate(view.courseDueAt, timeZone)}</span>
            </p>
          ) : null}
        </div>
      </div>
    </header>
  )
}

function NextUp({ card }: { card: ModuleCardView }) {
  return (
    <section aria-labelledby="home-next" className="flex flex-col justify-between gap-6 rounded-2xl border border-academy-blue bg-white p-6 sm:p-8">
      <div>
        <h2 id="home-next" className="text-[13px] font-semibold tracking-[0.14em] text-academy-blue-dark">UP NEXT</h2>
        <p className="mt-3 text-sm font-semibold tracking-[0.1em] text-academy-slate">
          MODULE {String(card.number).padStart(2, '0')}
        </p>
        <p className="mt-1 text-balance text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{card.title}</p>
        <p className="mt-3 flex items-center gap-1.5 text-academy-slate">
          <Clock aria-hidden className="size-4" />
          About {card.estimatedMinutes} min
        </p>
      </div>
      {/* No prefetch: loading a module marks it as started. */}
      <Link
        href={`/onboarding/${card.slug}`}
        prefetch={false}
        className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-academy-blue px-8 text-lg font-semibold text-white transition-colors hover:bg-academy-blue-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-academy-blue sm:w-fit"
      >
        Continue
        <ArrowRight aria-hidden className="size-5" />
      </Link>
    </section>
  )
}

const OPEN_QUIZ_STATES: readonly QuizStatus[] = ['READY', 'COOLDOWN', 'PASSED_UNSIGNED']

function AllDone({ total, quiz, timeZone }: { total: number; quiz: HomeQuizView; timeZone: string | null }) {
  const { label, href } = quizCardCopy(quiz, timeZone)
  return (
    <section aria-labelledby="home-done" className="flex flex-col justify-center rounded-2xl border border-academy-blue bg-academy-blue-tint p-6 sm:p-8">
      <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-white text-academy-blue">
        <PartyPopper className="size-6" />
      </span>
      <h2 id="home-done" className="mt-4 text-balance text-2xl font-extrabold leading-tight tracking-tight">
        All {total} modules done. Your culture quiz is next.
      </h2>
      {href && OPEN_QUIZ_STATES.includes(quiz.status) ? (
        <Link
          href={href}
          prefetch={false}
          className="mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-academy-blue px-8 py-3 text-lg font-semibold text-white transition-colors hover:bg-academy-blue-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-academy-blue sm:w-fit"
        >
          {label}
          <ArrowRight aria-hidden className="size-5" />
        </Link>
      ) : null}
    </section>
  )
}

function WaitingNext() {
  return (
    <section aria-labelledby="home-waiting-next" className="flex flex-col justify-center rounded-2xl border border-academy-line bg-white p-6 sm:p-8">
      <h2 id="home-waiting-next" className="text-xl font-semibold">Your next module isn&apos;t open yet.</h2>
    </section>
  )
}

function PhaseGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-4 text-xl font-semibold">{heading}</h2>
      {children}
    </section>
  )
}

function Released({ view }: { view: ReleasedHomeView }) {
  const timeZone = view.yourCalls.timeZone
  const step = homeNextStep(view)
  return (
    <>
      <Hero view={view} timeZone={timeZone} />
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:py-10">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {step === 'all-done' ? <AllDone total={view.total} quiz={view.quiz} timeZone={timeZone} /> : null}
          {step === 'next' && view.nextModule ? <NextUp card={view.nextModule} /> : null}
          {step === 'waiting-next' ? <WaitingNext /> : null}
          <div className="space-y-5">
            <CallsCard calls={view.yourCalls} />
            <BuddyCard buddy={view.yourBuddy} />
          </div>
        </div>
        {view.phases.map(({ phase, modules }) => (
          <PhaseGroup key={phase} heading={PHASE_HEADINGS[phase]}>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((card) => (
                <ModuleCard key={card.slug} card={card} timeZone={timeZone} />
              ))}
            </ul>
          </PhaseGroup>
        ))}
        <PhaseGroup heading={QUIZ_HEADING}>
          <QuizCard quiz={view.quiz} timeZone={timeZone} />
        </PhaseGroup>
      </div>
    </>
  )
}

export function AcademyHome({ view, hireWaiting }: AcademyHomeProps) {
  const panel = homePanel(view, hireWaiting)
  if (panel === 'waiting') return <WaitingPanel />
  if (panel === 'nothing-to-do' || !view.released) return <NothingToDoPanel />
  return (
    <div
      style={ACADEMY_THEME_VARS}
      className={cn(academySans.className, academySerif.variable, 'min-h-full bg-academy-paper text-academy-navy selection:bg-academy-blue/20')}
    >
      <Released view={view} />
    </div>
  )
}
