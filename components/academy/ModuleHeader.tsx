import type { ModuleView } from '@/lib/academy/view'
import { formatAcademyDate, moduleNumberLabel } from '@/lib/academy/view-labels'
import { academyIcon } from './icons'
import { academySerif } from './fonts'

interface ModuleHeaderProps {
  view: ModuleView
}

function Chip({ tone, children }: { tone: 'danger' | 'info'; children: string }) {
  const colour = tone === 'danger' ? 'text-academy-danger' : 'text-academy-blue-dark'
  return <span className={`rounded-full bg-white px-3 py-1 text-sm font-semibold ${colour}`}>{children}</span>
}

function HeaderStatus({ view }: ModuleHeaderProps) {
  const { progress, callTimes } = view
  const timeZone = callTimes.timeZone
  if (progress.status === 'COMPLETED') {
    const date = progress.completedAt ? ` ${formatAcademyDate(progress.completedAt, timeZone)}` : ''
    return <Chip tone="info">{`Completed${date}`}</Chip>
  }
  if (progress.overdue) return <Chip tone="danger">Overdue</Chip>
  return progress.dueAt ? <span className="text-[15px]">{`Due ${formatAcademyDate(progress.dueAt, timeZone)}`}</span> : null
}

export function ModuleHeader({ view }: ModuleHeaderProps) {
  const Icon = academyIcon(view.icon)
  const hasHeadline = Boolean(view.headlineLead && view.headlineAccent)
  return (
    <header className="bg-academy-blue text-white">
      <div className="mx-auto flex w-full max-w-[720px] items-start justify-between gap-4 px-5 pb-8 pt-7 sm:pb-10 sm:pt-9">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tracking-[0.14em]">{view.plain ? 'ASSIGNED TO YOU' : moduleNumberLabel(view.number, view.total)}</p>
          <h1 className="mt-3 text-balance text-[2rem] font-extrabold leading-[1.08] tracking-tight sm:text-[2.75rem]">
            {hasHeadline ? (
              <>
                {view.headlineLead}{' '}
                <span className={`${academySerif.className} text-[1.15em] font-normal italic tracking-normal`}>{view.headlineAccent}</span>
              </>
            ) : (
              view.title
            )}
          </h1>
          <p className="mt-3 text-[15px]">
            {hasHeadline ? `${view.title} · ` : ''}
            {`About ${view.estimatedMinutes} min`}
          </p>
          <div className="mt-3 empty:hidden">
            <HeaderStatus view={view} />
          </div>
        </div>
        <span aria-hidden className="hidden size-12 shrink-0 items-center justify-center rounded-full bg-white sm:flex">
          <Icon className="size-6 text-academy-blue" />
        </span>
      </div>
    </header>
  )
}
